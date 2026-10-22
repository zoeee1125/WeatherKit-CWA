import { Console } from "@nsnanocat/util";
import QPESUMS from "./QPESUMS.mjs";

/**
 * 未來一小時降水預報。
 * Next-hour precipitation forecast.
 *
 * 天氣 App 會單獨請求 `dataSets=forecastNextHour`，但 Apple 只對澳洲、愛爾蘭、日本、
 * 英國與美國提供這份資料，台灣不在名單內，因此回應裡沒有可用的內容。
 * The Weather app requests `dataSets=forecastNextHour` on its own, but Apple only serves that
 * dataset for Australia, Ireland, Japan, the United Kingdom and the United States. Taiwan is
 * not on the list, so the response carries nothing usable.
 *
 * 這裡改用中央氣象署 QPESUMS 的「未來 1 小時雷達定量降雨預報」格點資料補上，
 * 讓天氣 App 能顯示「接下來一小時」的降水卡片，並排出原生降雨通知。
 * This class fills the gap with CWA QPESUMS "next hour radar QPF" grid data so the Weather app
 * can render its next-hour precipitation card and schedule its own rainfall notification.
 *
 * 天氣 App 的「未來一小時降水強度」通知不是推播，而是系統讀取這份資料後自行排定：
 * 逐分鐘資料裡必須存在「先無雨、後有雨」的轉折，`condition` 才會帶上 `START` 與 `FIRST_AT`，
 * 系統也才有起雨時間可以排定通知。若整小時都是「正在下雨」，系統只知道現在正在下，
 * 不會發出「即將降雨」的通知。
 * The Weather app's next-hour precipitation notification is not a push; the system schedules it
 * from this data. The minute series must contain a dry-to-wet transition so that `condition`
 * carries `START` with a `FIRST_AT` parameter for the onset. A series that is wet from the first
 * minute only says it is already raining, so no "rain is coming" alert is scheduled.
 */
export default class ForecastNextHour {
    static Name = "ForecastNextHour";
    static Version = "2.0.0";
    static Author = "iRingo";

    /** 降水強度換算用的分級（毫米／小時）。 / Intensity bands in millimetres per hour. */
    static #Bands = {
        NO: [0, 0.08],
        LIGHT: [0.08, 3.44],
        MODERATE: [3.44, 11.33],
        HEAVY: [11.33, 51.3],
        EXTREME: [51.3, Number.POSITIVE_INFINITY],
    };

    /** 判定「會下雨」的門檻（毫米／小時）。 / Threshold for "will rain" in millimetres per hour. */
    static RainThreshold = 0.5;

    /**
     * 判定「雨勢明顯增強」的倍數。
     * Ratio above which the coming hour counts as a significant increase.
     *
     * 過去一小時只是飄雨（例如 0.25 毫米）時，未來一小時若有 3.4 毫米，
     * 對使用者仍是「要變天了」，不該因為「已經在下雨」而略過。
     * A trace amount in the past hour (say 0.25 mm) followed by 3.4 mm in the coming hour is
     * still news to the user, so it must not be skipped as "already raining".
     */
    static IntensityRatio = 2;

    /** 通知的冷卻時間（秒）。 / Notification cooldown in seconds. */
    static AlertCooldown = 90 * 60;

    /** 預報有效期（秒）；iOS 會隱藏過期的下一小時資料。 / Validity window in seconds. */
    static ExpirationInterval = 10 * 60;

    /** 預報長度（分鐘）。 / Length of the forecast in minutes. */
    static Horizon = 60;

    /**
     * 起雨時間的近似值（分鐘）。
     * Approximate lead time until rain starts, in minutes.
     *
     * QPESUMS 只提供「未來一小時累積雨量」，沒有逐分鐘曲線，無法得知雨在這一小時的哪一分鐘
     * 開始。這裡取與 QPESUMS 更新頻率相同的十分鐘：前十分鐘無雨、之後才下雨，
     * 系統才有「起雨」事件可以排定通知。
     * QPESUMS only publishes the accumulated rainfall for the next hour rather than a
     * minute-by-minute curve, so the exact onset within the hour is unknown. Ten minutes — the
     * cadence at which QPESUMS refreshes — is used as the approximation: the first ten minutes
     * stay dry and the rain follows, which gives the system an onset to schedule against.
     */
    static OnsetLead = 10;

    /** 有雨時的逐分鐘降水機率（%）。 / Per-minute precipitation chance while raining (%). */
    static RainChance = 100;

    /**
     * 建立未來一小時預報。
     * Create the next-hour forecast.
     * @param {ReturnType<typeof import("../function/parseWeatherKitURL.mjs").default>} parameters WeatherKit 請求參數 / WeatherKit request parameters.
     * @param {string} token 開放資料平台授權碼 / Open Data authorization key.
     */
    constructor(parameters, token) {
        Console.log(`🟧 ${ForecastNextHour.Name} v${ForecastNextHour.Version}`);
        this.token = String(token ?? "").trim();
        this.latitude = Number(parameters?.latitude);
        this.longitude = Number(parameters?.longitude);
        this.language = String(parameters?.language ?? "").trim() || "zh-Hant-TW";
    }

    #grid;

    /**
     * 取得 QPESUMS 的過去與未來一小時雨量。
     * Read the past-hour and next-hour rainfall from QPESUMS.
     * @returns {Promise<{future: number | undefined, past: number | undefined, time: string | undefined}>}
     */
    async #Grid() {
        if (this.#grid) return this.#grid;
        this.#grid = (async () => {
            const [future, past] = await Promise.all([QPESUMS.Area(this.latitude, this.longitude, QPESUMS.FutureDataset, this.token), QPESUMS.Area(this.latitude, this.longitude, QPESUMS.PastDataset, this.token)]);
            return { future: future.value, past: past.value, time: future.time ?? past.time };
        })();
        return this.#grid;
    }

    /**
     * 建立 WeatherKit 的 `forecastNextHour` 資料槽。
     * Build the WeatherKit `forecastNextHour` slot.
     *
     * 中央氣象署只提供「未來一小時累積雨量」，沒有逐分鐘的強度曲線，因此把整小時的累積量
     * 平均分配到有雨的分鐘，強度單位為毫米／小時；起雨時間見 `OnsetLead`。
     * CWA only publishes the accumulated rainfall for the next hour rather than a minute-by-minute
     * intensity curve, so the hourly total is spread evenly across the wet minutes; the intensity
     * unit is millimetres per hour. See `OnsetLead` for the onset approximation.
     *
     * @returns {Promise<object | undefined>} WeatherKit 資料槽，沒有資料時為 undefined / The WeatherKit slot, or undefined without data.
     */
    async NextHour() {
        Console.info("☑️ ForecastNextHour.NextHour");
        const { future, past, time } = await this.#Grid();
        if (future === undefined) {
            Console.info("✅ ForecastNextHour.NextHour", "No QPESUMS data");
            return undefined;
        }
        const now = Math.trunc(Date.now() / 1000);
        const forecastStart = now - (now % 60);
        const willRain = future >= ForecastNextHour.RainThreshold;
        // 過去一小時已經有明顯雨量時視為「正在下雨」，不再製造起雨轉折，
        // 否則天氣 App 會對一場已經在下、使用者早就知道的雨再通知一次。
        // Rain in the past hour means it is already raining; no onset transition is created so the
        // Weather app does not announce a rain event the user is already in.
        const ongoing = (past ?? 0) >= QPESUMS.MinimumRain;
        const lead = willRain && !ongoing ? Math.min(ForecastNextHour.OnsetLead, ForecastNextHour.Horizon - 1) : 0;
        const onset = willRain ? forecastStart + lead * 60 : undefined;
        const wetMinutes = ForecastNextHour.Horizon - lead;
        // 整小時累積雨量換算成「有雨分鐘」的降雨強度（毫米／小時）。
        // Convert the hourly total into an intensity over the wet minutes (millimetres per hour).
        const intensity = willRain ? Math.round((future * 60 * 100) / wetMinutes) / 100 : 0;
        const minutes = ForecastNextHour.Minutes({ startTime: forecastStart, onset, intensity, chance: ForecastNextHour.RainChance });
        const summary = ForecastNextHour.Runs(minutes);
        const condition = ForecastNextHour.Conditions(summary);
        const result = {
            metadata: this.#Metadata({ reportedTime: ForecastNextHour.ToUnixSeconds(time) ?? now }),
            condition,
            summary,
            minutes,
            forecastStart,
            forecastEnd: forecastStart + ForecastNextHour.Horizon * 60,
        };
        Console.info("✅ ForecastNextHour.NextHour", `rain: ${willRain}`, `ongoing: ${ongoing}`, `onset: ${onset ?? "n/a"}`, `intensity: ${intensity} mm/h`, `time: ${time ?? "n/a"}`);
        Console.debug("ForecastNextHour.NextHour", `condition: ${JSON.stringify(condition)}`, `summary: ${JSON.stringify(summary)}`);
        return result;
    }

    /**
     * 建立逐分鐘降水序列。
     * Build the per-minute precipitation series.
     *
     * @param {{startTime?: number, onset?: number, intensity?: number, chance?: number}} [options] 選項 / Options.
     * @returns {object[]} 逐分鐘資料，附帶 `condition`、`summaryCondition` 與 `clear` 供後續彙整 / Minute entries carrying `condition`, `summaryCondition` and `clear` for aggregation.
     */
    static Minutes({ startTime = 0, onset, intensity = 0, chance = ForecastNextHour.RainChance } = {}) {
        const minutes = [];
        for (let index = 0; index < ForecastNextHour.Horizon; index++) {
            const minuteStart = startTime + index * 60;
            const wet = onset !== undefined && minuteStart >= onset;
            const value = wet ? intensity : 0;
            minutes.push({
                startTime: minuteStart,
                precipitationChance: wet ? chance : 0,
                precipitationIntensity: value,
                perceivedPrecipitationIntensity: ForecastNextHour.Perceived(value),
                // 以下三個欄位只供彙整使用，編碼時會被忽略。
                // The three fields below are only used for aggregation and are dropped when encoding.
                condition: ForecastNextHour.Condition(value),
                summaryCondition: wet ? "RAIN" : "CLEAR",
                clear: !wet,
            });
        }
        return minutes;
    }

    /**
     * 把逐分鐘序列合併成連續的降水段落。
     * Merge the minute series into consecutive precipitation runs.
     *
     * 段落以降水類型（有雨／無雨）切分，強度取段落內最大值；天氣 App 靠這些段落畫出
     * 「幾分鐘後開始下雨」的時間軸。
     * Runs are split by precipitation type (wet or dry) and keep the maximum intensity inside the
     * run; the Weather app draws its "rain in N minutes" timeline from them.
     *
     * @param {object[]} minutes 逐分鐘資料 / Minute entries.
     * @returns {object[]} 降水段落 / Precipitation runs.
     */
    static Runs(minutes = []) {
        const runs = [];
        for (const minute of minutes) {
            const last = runs.at(-1);
            if (last && last.condition === minute.summaryCondition) {
                last.endTime = minute.startTime + 60;
                last.precipitationChance = Math.max(last.precipitationChance, minute.precipitationChance);
                if (minute.precipitationIntensity > last.precipitationIntensity) {
                    last.precipitationIntensity = minute.precipitationIntensity;
                    last.maxCondition = minute.condition;
                }
                continue;
            }
            runs.push({
                condition: minute.summaryCondition,
                startTime: minute.startTime,
                endTime: minute.startTime + 60,
                precipitationChance: minute.precipitationChance,
                precipitationIntensity: minute.precipitationIntensity,
                maxCondition: minute.condition,
                clear: minute.clear,
            });
        }
        return runs;
    }

    /**
     * 由降水段落產生天氣 App 的時間軸事件。
     * Turn the precipitation runs into the Weather app's timeline events.
     *
     * `forecastToken` 是系統判斷事件的依據：`START` 代表「幾點開始下雨」、`STOP` 代表「幾點停」，
     * 時間放在 `parameters` 的 `FIRST_AT`／`SECOND_AT`。少了 `START` 與 `FIRST_AT`，
     * 系統就不知道雨何時開始，也就不會排定降雨通知。
     * `forecastToken` is what the system reads: `START` means "rain begins at", `STOP` means "rain
     * ends at", and the times live in the `FIRST_AT` / `SECOND_AT` parameters. Without `START` and
     * `FIRST_AT` the system has no onset to schedule a rainfall notification against.
     *
     * @param {object[]} runs 降水段落 / Precipitation runs.
     * @returns {object[]} `condition` 陣列 / The `condition` array.
     */
    static Conditions(runs = []) {
        const conditions = [];
        if (!runs.length) return conditions;
        for (let index = 0; index < runs.length; index++) {
            const current = runs[index];
            const next = runs[index + 1];
            const afterNext = runs[index + 2];
            // 無雨段落只負責交代「下一段何時開始」，時間軸本身交給下一段。
            // A dry run only announces when the next run begins.
            if (current.clear) {
                if (!next) {
                    conditions.push({
                        beginCondition: current.maxCondition,
                        endCondition: current.maxCondition,
                        forecastToken: "CLEAR",
                        parameters: [],
                        startTime: current.startTime,
                        endTime: 0,
                    });
                } else if (afterNext) {
                    conditions.push({
                        beginCondition: next.maxCondition,
                        endCondition: next.maxCondition,
                        forecastToken: "START_STOP",
                        parameters: [
                            { date: next.startTime, type: "FIRST_AT" },
                            { date: next.endTime, type: "SECOND_AT" },
                        ],
                        startTime: current.startTime,
                        endTime: current.endTime,
                    });
                } else {
                    conditions.push({
                        beginCondition: next.maxCondition,
                        endCondition: next.maxCondition,
                        forecastToken: "START",
                        parameters: [{ date: next.startTime, type: "FIRST_AT" }],
                        startTime: current.startTime,
                        endTime: current.endTime,
                    });
                }
                continue;
            }
            // 有雨段落：最後一段沒有結束時間，`endTime` 必須寫 0。
            // A wet run runs to the horizon, which is encoded as an `endTime` of zero.
            if (!next) {
                conditions.push({
                    beginCondition: current.maxCondition,
                    endCondition: current.maxCondition,
                    forecastToken: "CONSTANT",
                    parameters: [],
                    startTime: current.startTime,
                    endTime: 0,
                });
            } else if (afterNext) {
                conditions.push({
                    beginCondition: current.maxCondition,
                    endCondition: afterNext.maxCondition,
                    forecastToken: "STOP_START",
                    parameters: [
                        { date: current.endTime, type: "FIRST_AT" },
                        { date: afterNext.startTime, type: "SECOND_AT" },
                    ],
                    startTime: current.startTime,
                    endTime: current.endTime,
                });
            } else {
                conditions.push({
                    beginCondition: current.maxCondition,
                    endCondition: current.maxCondition,
                    forecastToken: "STOP",
                    parameters: [{ date: current.endTime, type: "FIRST_AT" }],
                    startTime: current.startTime,
                    endTime: current.endTime,
                });
            }
        }
        return conditions;
    }

    /**
     * 判斷是否該發出降雨通知。
     * Decide whether a rainfall notification should be sent.
     *
     * 三種情況：
     * - 過去一小時幾乎沒雨、未來一小時會下雨 → `STARTING`（即將降雨）
     * - 過去一小時有雨但雨勢明顯變大 → `INTENSIFYING`（雨勢將增強）
     * - 其餘（沒雨，或雨勢持平／變小）→ 不通知
     * Three outcomes:
     * - barely any rain in the past hour and rain expected → `STARTING`
     * - some rain in the past hour but the coming hour is much wetter → `INTENSIFYING`
     * - anything else (dry, steady, or easing off) → no notification
     *
     * @returns {Promise<{alert: boolean, reason: "STARTING" | "INTENSIFYING" | "NONE", future: number | undefined, past: number | undefined, time: string | undefined}>}
     */
    async Alert() {
        const { future, past, time } = await this.#Grid();
        const reason = ForecastNextHour.Decide(future, past);
        return { alert: reason !== "NONE", reason, future, past, time };
    }

    /**
     * 依過去與未來一小時的雨量決定要不要通知。
     * Decide from the past-hour and next-hour rainfall whether to notify.
     *
     * @param {number | undefined} future 未來一小時預估雨量（毫米）/ Expected rain in the coming hour, in millimetres.
     * @param {number | undefined} past 過去一小時雨量（毫米）/ Rain in the past hour, in millimetres.
     * @returns {"STARTING" | "INTENSIFYING" | "NONE"}
     */
    static Decide(future, past) {
        // 未來一小時沒有明顯雨量就沒有提醒的必要。
        // Without meaningful rain in the coming hour there is nothing to report.
        if (future === undefined || future < ForecastNextHour.RainThreshold) return "NONE";
        const previous = past ?? 0;
        // 過去一小時幾乎沒雨：這是「即將開始下雨」。
        // Almost no rain in the past hour: rain is about to start.
        if (previous < QPESUMS.MinimumRain) return "STARTING";
        // 已經有雨但未來明顯更多：這是「雨勢將增強」。
        // Some rain already, but the coming hour is much wetter: rain will intensify.
        if (future >= previous * ForecastNextHour.IntensityRatio) return "INTENSIFYING";
        return "NONE";
    }

    /**
     * 產生通知文案。
     * Build the notification copy.
     *
     * 標題前置使用者最需要分辨的資訊（多久內、會不會變大），本文只放雨量。
     * The title leads with what the user needs to distinguish (how soon, or whether it will get
     * heavier); the body carries only the amounts.
     *
     * @param {"STARTING" | "INTENSIFYING" | "NONE"} reason 通知原因 / Why the alert fires.
     * @param {number} future 未來一小時預估雨量（毫米）/ Expected rain in the coming hour, in millimetres.
     * @param {number} past 過去一小時雨量（毫米）/ Rain in the past hour, in millimetres.
     * @returns {{title: string, body: string}}
     */
    static Message(reason, future, past) {
        switch (reason) {
            case "INTENSIFYING":
                return {
                    title: "雨勢會變大",
                    body: `預估雨量 ${future} 毫米，過去 1 小時 ${past} 毫米。`,
                };
            case "STARTING":
            default:
                return {
                    title: "1 小時內會下雨",
                    body: `預估雨量 ${future} 毫米，出門記得帶傘。`,
                };
        }
    }

    /**
     * 把 ISO 時間字串換算成 Unix 秒。
     * Convert an ISO timestamp into Unix seconds.
     * @param {string} [time] ISO 時間字串 / ISO timestamp.
     * @returns {number | undefined}
     */
    static ToUnixSeconds(time) {
        if (!time) return undefined;
        const milliseconds = new Date(time).getTime();
        return Number.isNaN(milliseconds) ? undefined : Math.trunc(milliseconds / 1000);
    }

    /**
     * 建立氣象資料中繼資料。
     * Build the WeatherKit metadata.
     *
     * 有效期從「現在」起算：QPESUMS 的觀測時間可能已經過了幾分鐘，若從觀測時間加十分鐘，
     * 資料一送達就快過期，天氣 App 會直接隱藏卡片與通知。
     * The validity window starts at the current time: the QPESUMS issue time can already be a few
     * minutes old, and counting the ten minutes from it would leave the data nearly expired on
     * arrival, which makes the Weather app hide both the card and the notification.
     *
     * @param {{reportedTime?: number}} [options] 選項 / Options.
     * @returns {object}
     */
    #Metadata({ reportedTime } = {}) {
        const timeStamp = Math.trunc(Date.now() / 1000);
        return {
            attributionUrl: "https://www.cwa.gov.tw/V8/C/P/QPF.html",
            expireTime: timeStamp + ForecastNextHour.ExpirationInterval,
            language: this.language,
            latitude: this.latitude,
            longitude: this.longitude,
            providerName: "中央氣象署",
            readTime: timeStamp,
            reportedTime: reportedTime ?? timeStamp,
            temporarilyUnavailable: false,
            sourceType: "MODELED",
        };
    }

    /**
     * 把降水強度換算成天氣 App 的感知強度（0–3）。
     * Convert precipitation intensity into the Weather app's perceived intensity (0–3).
     * @param {number} intensity 降水強度（毫米／小時）/ Intensity in millimetres per hour.
     * @returns {number}
     */
    static Perceived(intensity) {
        if (!Number.isFinite(intensity) || intensity <= 0) return 0;
        const { NO, LIGHT, MODERATE, HEAVY, EXTREME } = ForecastNextHour.#Bands;
        switch (true) {
            case intensity <= NO[1]:
                // 輕微降水，通常感知不到 / Trace amounts are usually imperceptible.
                return 0;
            case intensity <= LIGHT[1]:
                return ForecastNextHour.#Scale(intensity, LIGHT, 0, 1);
            case intensity <= MODERATE[1]:
                return ForecastNextHour.#Scale(intensity, MODERATE, 1, 2);
            case intensity <= HEAVY[1]:
                return ForecastNextHour.#Scale(intensity, HEAVY, 2, 3);
            default:
                return ForecastNextHour.#Scale(intensity, EXTREME, 2, 3);
        }
    }

    /**
     * 把數值線性映射到指定區間並截斷到三位小數。
     * Map a value linearly into a range and truncate to three decimals.
     * @param {number} value 數值 / Value.
     * @param {[number, number]} band 分級區間 / Band range.
     * @param {number} low 目標下界 / Target lower bound.
     * @param {number} high 目標上界 / Target upper bound.
     * @returns {number}
     */
    static #Scale(value, band, low, high) {
        const ratio = (value - band[0]) / (band[1] - band[0]);
        return Math.trunc((low + Math.min(1, Math.max(0, ratio)) * (high - low)) * 1000) / 1000;
    }

    /**
     * 依降水強度決定天氣狀況代碼。
     * Pick the condition code from the precipitation intensity.
     * @param {number} intensity 降水強度（毫米／小時）/ Intensity in millimetres per hour.
     * @returns {string} WeatherKit 的 ConditionType / WeatherKit ConditionType.
     */
    static Condition(intensity) {
        const { NO, LIGHT, MODERATE } = ForecastNextHour.#Bands;
        switch (true) {
            case !Number.isFinite(intensity) || intensity <= 0:
                return "CLEAR";
            case intensity <= NO[1]:
                return "POSSIBLE_DRIZZLE";
            case intensity <= LIGHT[1]:
                return "DRIZZLE";
            case intensity <= MODERATE[1]:
                return "RAIN";
            default:
                return "HEAVY_RAIN";
        }
    }
}
