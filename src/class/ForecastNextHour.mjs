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
 * 讓天氣 App 能顯示「接下來一小時」的降水卡片。
 * This class fills the gap with CWA QPESUMS "next hour radar QPF" grid data so the Weather
 * app can render its next-hour precipitation card.
 */
export default class ForecastNextHour {
    static Name = "ForecastNextHour";
    static Version = "1.0.0";
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
            const [future, past] = await Promise.all([
                QPESUMS.Area(this.latitude, this.longitude, QPESUMS.FutureDataset, this.token),
                QPESUMS.Area(this.latitude, this.longitude, QPESUMS.PastDataset, this.token),
            ]);
            return { future: future.value, past: past.value, time: future.time ?? past.time };
        })();
        return this.#grid;
    }

    /**
     * 建立 WeatherKit 的 `forecastNextHour` 資料槽。
     * Build the WeatherKit `forecastNextHour` slot.
     *
     * 中央氣象署只提供「未來一小時累積雨量」，沒有逐分鐘的強度曲線，
     * 因此把整小時的累積量平均分配到 60 分鐘，強度單位為毫米／小時。
     * CWA only publishes the accumulated rainfall for the next hour rather than a minute-by-minute
     * intensity curve, so the hourly total is spread evenly across the 60 minutes; the intensity
     * unit is millimetres per hour.
     *
     * @returns {Promise<object | undefined>} WeatherKit 資料槽，沒有資料時為 undefined / The WeatherKit slot, or undefined without data.
     */
    async NextHour() {
        Console.info("☑️ ForecastNextHour.NextHour");
        const { future, time } = await this.#Grid();
        if (future === undefined) {
            Console.info("✅ ForecastNextHour.NextHour", "No QPESUMS data");
            return undefined;
        }
        const rain = future >= ForecastNextHour.RainThreshold;
        const intensity = rain ? Math.round(future * 100) / 100 : 0;
        const perceived = ForecastNextHour.Perceived(intensity);
        const condition = ForecastNextHour.Condition(intensity);
        const startTime = Math.trunc(Date.now() / 1000);
        const forecastStart = startTime - (startTime % 60);
        const forecastEnd = forecastStart + 60 * 60;
        const minutes = [];
        for (let index = 0; index < 60; index++) {
            minutes.push({
                startTime: forecastStart + index * 60,
                precipitationChance: rain ? 100 : 0,
                precipitationIntensity: intensity,
                perceivedPrecipitationIntensity: perceived,
            });
        }
        const result = {
            metadata: this.#Metadata({ reportedTime: ForecastNextHour.ToUnixSeconds(time) ?? startTime }),
            condition: [
                {
                    beginCondition: condition,
                    endCondition: condition,
                    forecastToken: rain ? "CONSTANT" : "CLEAR",
                    parameters: [],
                    startTime: forecastStart,
                    endTime: 0,
                },
            ],
            summary: [
                {
                    condition: rain ? "RAIN" : "CLEAR",
                    startTime: forecastStart,
                    endTime: forecastEnd,
                    precipitationChance: rain ? 100 : 0,
                    precipitationIntensity: intensity,
                },
            ],
            minutes,
            forecastStart,
            forecastEnd,
        };
        Console.info("✅ ForecastNextHour.NextHour", `rain: ${rain}`, `intensity: ${intensity} mm/h`, `time: ${time ?? "n/a"}`);
        return result;
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
     * @param {{reportedTime?: number}} [options] 選項 / Options.
     * @returns {object}
     */
    #Metadata({ reportedTime } = {}) {
        const timeStamp = Math.trunc(Date.now() / 1000);
        return {
            attributionUrl: "https://www.cwa.gov.tw/V8/C/P/QPF.html",
            expireTime: (reportedTime ?? timeStamp) + ForecastNextHour.ExpirationInterval,
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
        const { NO, LIGHT, MODERATE, HEAVY } = ForecastNextHour.#Bands;
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
