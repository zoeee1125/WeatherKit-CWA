import { Console, fetch } from "@nsnanocat/util";
import AirQualityScale from "./AirQualityScale.mjs";

/**
 * 空氣品質資料來源。
 * Air-quality data provider.
 *
 * 資料來自環境部環境資料開放平臺 `AQX_P_432`（空氣品質指標 AQI），
 * 需要會員 API key。以最近測站對應請求座標。
 * Data comes from Taiwan MOENV dataset `AQX_P_432`, which requires a member API key.
 * The nearest station is matched to the requested coordinates.
 */
export default class AirQuality {
    static Name = "AirQuality";
    static Version = "1.0.0";
    static Author = "iRingo";

    static Endpoint = "https://data.moenv.gov.tw/api/v2/aqx_p_432";

    /** 使用的標準名稱 / Scale identifier（含修訂版號，供 App 快取破版用）。 */
    static Scale = AirQualityScale.RequestName;

    /** 空氣品質有效期（秒）；測站每小時更新。 / Validity window in seconds; stations update hourly. */
    static ExpirationInterval = 60 * 60;

    /** 最近測站的最大距離（公里）。 / Maximum distance to the nearest station in km. */
    static MaximumStationDistance = 80;

    /**
     * 缺值代碼。
     * Missing-value sentinels.
     */
    static #MissingValues = new Set(["", "-", "X", "x", "N/A", "NA", "null", "undefined"]);

    /**
     * 建立空氣品質資料來源。
     * Create the air-quality provider.
     * @param {ReturnType<typeof import("../function/parseWeatherKitURL.mjs").default>} parameters WeatherKit 請求參數 / WeatherKit request parameters.
     * @param {string} token 環境部 API key / MOENV API key.
     * @param {{useFixture?: boolean}} [options] 選項 / Options.
     */
    constructor(parameters, token, options = {}) {
        Console.log(`🟧 ${AirQuality.Name} v${AirQuality.Version}`);
        this.token = String(token ?? "").trim();
        this.latitude = Number(parameters?.latitude);
        this.longitude = Number(parameters?.longitude);
        this.country = parameters?.country;
        this.weatherKitLanguage = String(parameters?.weatherKitLanguage ?? parameters?.language ?? "").trim() || "zh-TW";
        this.useFixture = options.useFixture === true;
    }

    /**
     * 是否有 API key 與可用的座標。
     * Whether the provider has an API key and usable coordinates.
     * @returns {boolean}
     */
    get available() {
        return (this.useFixture || Boolean(this.token)) && Number.isFinite(this.latitude) && Number.isFinite(this.longitude);
    }

    /**
     * 顯示用資料來源名稱。
     * Display provider name.
     * @returns {string}
     */
    get providerName() {
        return "環境部";
    }

    /**
     * 距離（公里）。Great-circle distance in kilometres.
     * @param {number} latitude1 起點緯度 / Start latitude.
     * @param {number} longitude1 起點經度 / Start longitude.
     * @param {number} latitude2 終點緯度 / End latitude.
     * @param {number} longitude2 終點經度 / End longitude.
     * @returns {number}
     */
    static Distance(latitude1, longitude1, latitude2, longitude2) {
        const radius = 6371.0088;
        const toRadians = degrees => (degrees * Math.PI) / 180;
        const deltaLatitude = toRadians(latitude2 - latitude1);
        const deltaLongitude = toRadians(longitude2 - longitude1);
        const a = Math.sin(deltaLatitude / 2) ** 2 + Math.cos(toRadians(latitude1)) * Math.cos(toRadians(latitude2)) * Math.sin(deltaLongitude / 2) ** 2;
        return radius * 2 * Math.asin(Math.sqrt(a));
    }

    /**
     * 解析數值；缺值代碼視為無資料。
     * Parse a numeric value, treating sentinel codes as absent.
     * @param {unknown} value 原始值 / Raw value.
     * @returns {number | undefined}
     */
    static ToNumber(value) {
        const text = String(value ?? "").trim();
        if (AirQuality.#MissingValues.has(text)) return undefined;
        const numeric = Number.parseFloat(text);
        return Number.isFinite(numeric) ? numeric : undefined;
    }

    /**
     * 解析環境部時間字串（`YYYY/MM/DD HH:mm:ss`，UTC+8）。
     * Parse a MOENV timestamp (`YYYY/MM/DD HH:mm:ss`, UTC+8).
     * @param {unknown} value 時間字串 / Timestamp.
     * @returns {number | undefined} Unix 秒 / Unix seconds.
     */
    static ToUnixSeconds(value) {
        const text = String(value ?? "").trim();
        if (!text) return undefined;
        const normalized = text.replace(/\//g, "-").replace(" ", "T");
        const time = new Date(`${normalized}+08:00`).getTime();
        return Number.isNaN(time) ? undefined : Math.trunc(time / 1000);
    }

    /**
     * 依 AQI 數值取得等級編號（1–6）。
     * Map an AQI value to its category number (1–6).
     * @param {number | undefined} aqi AQI 數值 / AQI value.
     * @returns {number | undefined}
     */
    static CategoryNumber(aqi) {
        if (aqi === undefined) return undefined;
        switch (true) {
            case aqi <= 50:
                return 1;
            case aqi <= 100:
                return 2;
            case aqi <= 150:
                return 3;
            case aqi <= 200:
                return 4;
            case aqi <= 300:
                return 5;
            default:
                return 6;
        }
    }

    /**
     * 由最近測站產生 WeatherKit `airQuality` 片段。
     * Build a WeatherKit `airQuality` fragment from the nearest station.
     * @returns {Promise<object | undefined>}
     */
    async Current() {
        Console.info("☑️ AirQuality.Current");
        if (!this.available) {
            Console.info("✅ AirQuality.Current", "Unavailable");
            return;
        }
        const record = this.useFixture ? AirQuality.#Fixture() : await this.#Nearest();
        if (!record) {
            Console.info("✅ AirQuality.Current", "No nearby station");
            return;
        }
        const aqi = AirQuality.ToNumber(record.aqi);
        const pollutants = AirQuality.#Pollutants(record);
        Console.info("✅ AirQuality.Current", `${record.sitename}(${record.siteid})`, `AQI: ${aqi ?? "n/a"}`, `distance: ${record.distance?.toFixed?.(1) ?? "n/a"} km`);
        return {
            metadata: this.#Metadata({
                attributionUrl: "https://data.moenv.gov.tw/",
                reportedTime: AirQuality.ToUnixSeconds(record.publishtime),
                sourceType: "STATION",
            }),
            scale: AirQuality.Scale,
            ...(aqi === undefined ? {} : { index: aqi, categoryIndex: AirQuality.CategoryNumber(aqi) }),
            pollutants,
            ...(record.pollutant ? { primaryPollutant: AirQuality.#PollutantType(record.pollutant) } : {}),
            previousDayComparison: "UNKNOWN",
            isSignificant: false,
        };
    }

    /**
     * 建立氣象資料中繼資料。
     * Build WeatherKit metadata.
     * @param {{attributionUrl?: string, reportedTime?: number, sourceType?: string}} [options] 選項 / Options.
     * @returns {object}
     */
    #Metadata({ attributionUrl, reportedTime, sourceType = "STATION" } = {}) {
        const timeStamp = Math.trunc(Date.now() / 1000);
        return {
            attributionUrl,
            expireTime: (reportedTime ?? timeStamp) + AirQuality.ExpirationInterval,
            language: "zh-TW",
            latitude: this.latitude,
            longitude: this.longitude,
            providerName: this.providerName,
            readTime: timeStamp,
            reportedTime: reportedTime ?? timeStamp,
            temporarilyUnavailable: false,
            sourceType,
        };
    }

    /**
     * 取得最近測站的原始紀錄。
     * Fetch the nearest station record.
     * @returns {Promise<object | undefined>}
     */
    async #Nearest() {
        const records = await this.#Fetch();
        if (!records.length) return;
        let nearest;
        for (const record of records) {
            const latitude = AirQuality.ToNumber(record.latitude);
            const longitude = AirQuality.ToNumber(record.longitude);
            if (latitude === undefined || longitude === undefined) continue;
            const distance = AirQuality.Distance(this.latitude, this.longitude, latitude, longitude);
            if (!nearest || distance < nearest.distance) nearest = { ...record, distance };
        }
        if (!nearest) return;
        if (nearest.distance > AirQuality.MaximumStationDistance) {
            Console.warn("AirQuality.#Nearest", `nearest station ${nearest.sitename} is ${nearest.distance.toFixed(1)} km away`);
            return;
        }
        return nearest;
    }

    /**
     * 呼叫環境部 API。
     * Call the MOENV API.
     * @returns {Promise<Array<object>>}
     */
    async #Fetch() {
        if (!this.token) {
            Console.warn("AirQuality.#Fetch", "Missing API key");
            return [];
        }
        const url = new URL(AirQuality.Endpoint);
        url.searchParams.set("api_key", this.token);
        url.searchParams.set("format", "json");
        url.searchParams.set("limit", "1000");
        Console.info("☑️ AirQuality.#Fetch");
        try {
            const response = await fetch({ url: url.toString(), headers: { Accept: "application/json" }, timeout: 20 });
            const body = JSON.parse(response?.body ?? "[]");
            if (!Array.isArray(body)) {
                Console.error("AirQuality.#Fetch", `unexpected payload: ${String(response?.body ?? "").slice(0, 200)}`);
                return [];
            }
            Console.info("✅ AirQuality.#Fetch", `records: ${body.length}`);
            return body;
        } catch (error) {
            Console.error(`AirQuality.#Fetch: ${error}`);
            return [];
        }
    }

    /**
     * 把環境部污染物欄位轉成 WeatherKit `pollutants`。
     * Convert MOENV pollutant fields into WeatherKit `pollutants`.
     * @param {object} record 測站紀錄 / Station record.
     * @returns {Array<{pollutantType: string, amount: number, units: string}>}
     */
    static #Pollutants(record) {
        const mapping = [
            ["PM2_5", "pm2.5"],
            ["PM10", "pm10"],
            ["OZONE", "o3"],
            ["NO2", "no2"],
            ["SO2", "so2"],
            ["CO", "co"],
            ["NO", "no"],
            ["NOX", "nox"],
        ];
        const pollutants = [];
        for (const [pollutantType, key] of mapping) {
            const amount = AirQuality.ToNumber(record[key]);
            if (amount === undefined) continue;
            pollutants.push({ pollutantType, amount, units: "MICROGRAMS_PER_CUBIC_METER" });
        }
        return pollutants;
    }

    /**
     * 主要污染物名稱轉 WeatherKit 列舉。
     * Map the primary pollutant label to a WeatherKit enum.
     * @param {unknown} pollutant 污染物名稱 / Pollutant label.
     * @returns {string | undefined}
     */
    static #PollutantType(pollutant) {
        switch (String(pollutant ?? "").trim()) {
            case "細懸浮微粒":
            case "PM2.5":
                return "PM2_5";
            case "懸浮微粒":
            case "PM10":
                return "PM10";
            case "臭氧":
            case "O3":
                return "OZONE";
            case "二氧化氮":
            case "NO2":
                return "NO2";
            case "二氧化硫":
            case "SO2":
                return "SO2";
            case "一氧化碳":
            case "CO":
                return "CO";
            default:
                return undefined;
        }
    }

    /**
     * 第一階段的固定測試資料，用來驗證 App 是否願意渲染空氣品質。
     * Stage-one fixture used to verify that the app renders air quality at all.
     * @returns {object}
     */
    static #Fixture() {
        return {
            sitename: "測試站",
            siteid: "fixture",
            county: "臺北市",
            aqi: "72",
            pollutant: "細懸浮微粒",
            status: "普通",
            so2: "1.6",
            co: "0.35",
            o3: "58",
            o3_8hr: "23",
            pm10: "35",
            "pm2.5": "20",
            no2: "7",
            nox: "8.2",
            no: "1.2",
            wind_speed: "2.7",
            wind_direc: "252",
            publishtime: new Date(Math.trunc(Date.now() / 3600) * 3600 * 1000 + 8 * 3600 * 1000).toISOString().replace("T", " ").slice(0, 19),
            longitude: "121.5654",
            latitude: "25.0330",
            distance: 0,
        };
    }
}
