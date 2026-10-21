import { Console, fetch } from "@nsnanocat/util";
import { COUNTIES, STATIONS, TOWNSHIPS } from "../function/cwaLocations.mjs";
import providerNameToLogo from "../function/providerNameToLogo.mjs";

/**
 * 中央氣象署開放資料平台資料來源。
 * Central Weather Administration (CWA) Open Data provider.
 *
 * 使用的資料集 / Datasets:
 * - `O-A0003-001` 10 分鐘綜觀氣象資料：現在天氣 / 10-minute observations for current weather.
 * - `F-D0047-093` 鄉鎮天氣預報：一次取得未來 3 天與未來 1 週 / township forecast (3-day + 1-week in one request).
 * - `A-B0062-001`、`A-B0063-001`：日出日沒、月出月沒 / sunrise, sunset, moonrise, moonset.
 * - `W-C0033-001` 與 `W-C0033-003`～`010`、`W-C0034-001`：天氣警特報、颱風警報 / warnings and typhoon bulletins.
 *
 * 限制 / Limitations:
 * - 氣象署沒有分鐘級降水強度資料集，因此不提供 `forecastNextHour`。
 *   CWA has no minute-level precipitation dataset, so `forecastNextHour` is not provided.
 * - 氣象署沒有空氣品質資料集（臺灣空品屬環境部），因此不提供 `airQuality`。
 *   CWA has no air quality dataset (Taiwan AQ belongs to the Ministry of Environment).
 */
export default class CWA {
    static Name = "CWA";
    static Version = "1.0.0";
    static Author = "iRingo";

    static Endpoint = "https://opendata.cwa.gov.tw/api/v1/rest/datastore";

    /**
     * 只處理距離鄉鎮市區中心在此範圍內的座標。
     * Only handle coordinates within this distance of a township centroid.
     */
    static MaximumLocationDistance = 50; // km

    /**
     * 現在天氣只採用此距離內的觀測站。
     * Only adopt observing stations within this distance.
     */
    static MaximumStationDistance = 80; // km

    /**
     * 現在天氣有效期（秒）；測站每 10 分鐘更新。
     * Validity window for current weather; stations update every 10 minutes.
     */
    static CurrentWeatherExpirationInterval = 10 * 60;

    /**
     * 天氣現象文字對應 WeatherKit 的 conditionCode。
     * Weather text to WeatherKit conditionCode.
     * 順序即優先序：較長、較具體的描述必須排在前面。
     * Order matters: longer, more specific descriptions must come first.
     */
    static #ConditionRules = [
        [/雨夾雪|雨雪|雨或雪/, "WINTRY_MIX"],
        [/豪雨|大豪雨|超大豪雨|暴雨|強降雨/, "HEAVY_RAIN"],
        [/雷/, "THUNDERSTORMS"],
        [/陣雪|短暫雪/, "FLURRIES"],
        [/雪/, "SNOW"],
        [/毛毛雨|細雨/, "DRIZZLE"],
        [/雨/, "RAIN"],
        [/濃霧|有霧|晨霧|霧/, "FOGGY"],
        [/霾|沙塵|揚塵/, "HAZE"],
        [/晴時多雲/, "MOSTLY_CLEAR"],
        [/多雲時晴/, "PARTLY_CLOUDY"],
        [/多雲時陰|陰時多雲/, "MOSTLY_CLOUDY"],
        [/多雲/, "PARTLY_CLOUDY"],
        [/陰/, "CLOUDY"],
        [/風/, "WINDY"],
        [/晴/, "CLEAR"],
    ];

    static #WindDirectionRules = [
        [/東北/, 45],
        [/東南/, 135],
        [/西南/, 225],
        [/西北/, 315],
        [/北/, 0],
        [/東/, 90],
        [/南/, 180],
        [/西/, 270],
    ];

    /**
     * 警特報類型對應的資料集。
     * Warning phenomenon to dataset mapping.
     */
    static #WarningDatasets = [
        { pattern: /颱風/, dataset: "W-C0034-001" },
        { pattern: /大雨|豪雨/, dataset: "W-C0033-003" },
        { pattern: /低溫|寒害/, dataset: "W-C0033-004" },
        { pattern: /高溫/, dataset: "W-C0033-005" },
        { pattern: /強風|大風/, dataset: "W-C0033-006" },
        { pattern: /濃霧|霧/, dataset: "W-C0033-010" },
    ];

    /**
     * 非縣市名的特報區域別名。
     * Warning area aliases that are not county names.
     */
    static #WarningAreaAliases = new Map([
        ["蘭嶼綠島", "臺東縣"],
        ["恆春半島", "屏東縣"],
        ["基隆北海岸", "基隆市"],
    ]);

    /**
     * 逐時預報使用的 3 天資料元素。
     * Elements taken from the 3-day dataset for hourly forecasts.
     */
    static #HourlyElements = {
        temperature: "溫度",
        dewPoint: "露點溫度",
        humidity: "相對濕度",
        apparentTemperature: "體感溫度",
        windSpeed: "風速",
        windDirection: "風向",
        weather: "天氣現象",
        precipitationChance: "3小時降雨機率",
    };

    /**
     * 每日預報使用的 1 週資料元素。
     * Elements taken from the 1-week dataset for daily forecasts.
     */
    static #DailyElements = {
        averageTemperature: "平均溫度",
        maxTemperature: "最高溫度",
        minTemperature: "最低溫度",
        humidity: "平均相對濕度",
        maxApparentTemperature: "最高體感溫度",
        minApparentTemperature: "最低體感溫度",
        windSpeed: "風速",
        windDirection: "風向",
        precipitationChance: "12小時降雨機率",
        weather: "天氣現象",
        uvIndex: "紫外線指數",
    };

    /**
     * 建立中央氣象署資料來源。
     * Create the CWA provider.
     * @param {ReturnType<typeof import("../function/parseWeatherKitURL.mjs").default>} parameters WeatherKit 請求參數 / WeatherKit request parameters.
     * @param {string} token 開放資料平台授權碼 / Open Data authorization key.
     */
    constructor(parameters, token) {
        Console.log(`🟧 ${CWA.Name} v${CWA.Version}`);
        this.token = String(token ?? "").trim();
        this.latitude = Number(parameters?.latitude);
        this.longitude = Number(parameters?.longitude);
        this.country = parameters?.country;
        this.weatherKitLanguage = String(parameters?.weatherKitLanguage ?? parameters?.language ?? "").trim() || "zh-TW";
        this.location = this.#ResolveLocation();
        Console.debug(`location: ${JSON.stringify(this.location)}`);
    }

    #forecast;
    #sunMoon;
    #warnings = new Map();
    #station;

    /**
     * 是否有授權碼與可解析的臺灣地點。
     * Whether the provider has a token and a resolvable location in Taiwan.
     * @returns {boolean}
     */
    get available() {
        return Boolean(this.token) && Boolean(this.location);
    }

    /**
     * 顯示用資料來源名稱。
     * Display provider name.
     * @returns {string}
     */
    get providerName() {
        return "中央氣象署";
    }

    /**
     * 天氣現象文字轉 WeatherKit conditionCode。
     * Convert weather text into a WeatherKit conditionCode.
     * @param {unknown} text 天氣現象文字 / Weather text.
     * @returns {string | null}
     */
    static ConvertCondition(text) {
        const value = String(text ?? "").trim();
        if (!value) return null;
        for (const [pattern, condition] of CWA.#ConditionRules) if (pattern.test(value)) return condition;
        Console.debug(`CWA.ConvertCondition: unknown weather text ${value}`);
        return null;
    }

    /**
     * 未知天氣現象必須省略欄位；寫入 null 會覆蓋 Apple 原值並被 FlatBuffer 編成 CLEAR。
     * Unknown conditions must omit the field; writing null overwrites Apple's value and encodes as CLEAR.
     * @param {unknown} text 天氣現象文字 / Weather text.
     * @returns {{conditionCode?: string}}
     */
    static ConvertConditionField(text) {
        const conditionCode = CWA.ConvertCondition(text);
        return conditionCode == null ? {} : { conditionCode };
    }

    /**
     * 風向文字轉角度。
     * Convert a wind direction label into degrees.
     * @param {unknown} text 風向 / Wind direction.
     * @returns {number | undefined}
     */
    static ConvertWindDirection(text) {
        const value = String(text ?? "").trim();
        if (!value || /不定|旋轉/.test(value)) return undefined;
        for (const [pattern, degrees] of CWA.#WindDirectionRules) if (pattern.test(value)) return degrees;
        return CWA.ToNumber(value);
    }

    /**
     * 解析氣象署時間字串；沒有時區時視為 UTC+8。
     * Parse a CWA timestamp, treating a missing offset as UTC+8.
     * @param {unknown} value 時間字串 / Timestamp.
     * @returns {number | undefined} Unix 秒 / Unix seconds.
     */
    static ToUnixSeconds(value) {
        if (typeof value === "number") return Number.isFinite(value) ? Math.trunc(value) : undefined;
        const text = String(value ?? "").trim();
        if (!text) return undefined;
        let normalized = text;
        if (/^\d{4}-\d{2}-\d{2}$/.test(text)) normalized = `${text}T00:00:00+08:00`;
        else if (!/(?:[+-]\d{2}:?\d{2}|Z)$/i.test(text)) normalized = `${text.replace(" ", "T")}+08:00`;
        const time = new Date(normalized).getTime();
        return Number.isNaN(time) ? undefined : Math.trunc(time / 1000);
    }

    /**
     * 數值解析；氣象署缺值程式碼（X、T、-99、-98、-）視為無資料。
     * Numeric parsing that treats CWA missing-value codes (X, T, -99, -98, -) as absent.
     * @param {unknown} value 原始值 / Raw value.
     * @returns {number | undefined}
     */
    static ToNumber(value) {
        const text = String(value ?? "").trim();
        if (!text || /^(?:[XxTt-]+|-\d+(?:\.\d+)?)$/.test(text)) return undefined;
        const numeric = Number.parseFloat(text);
        return Number.isFinite(numeric) ? numeric : undefined;
    }

    /**
     * 以氣溫與相對濕度推算露點溫度（Magnus 公式）。
     * Derive the dew point from temperature and relative humidity.
     * @param {number | undefined} temperature 氣溫（°C）/ Temperature in Celsius.
     * @param {number | undefined} humidity 相對濕度（%）/ Relative humidity in percent.
     * @returns {number | undefined}
     */
    static DewPoint(temperature, humidity) {
        if (!Number.isFinite(temperature) || !Number.isFinite(humidity) || humidity <= 0) return undefined;
        const a = 17.625;
        const b = 243.04;
        const gamma = Math.log(humidity / 100) + (a * temperature) / (b + temperature);
        const dewPoint = (b * gamma) / (a - gamma);
        return Math.round(dewPoint * 10) / 10;
    }

    /**
     * 以 2000-01-06T18:14Z 的朔為基準推算月相。
     * Derive the moon phase from the 2000-01-06T18:14Z new moon.
     * @param {number} time 當日中午的 Unix 秒 / Noon of the day in Unix seconds.
     * @returns {"NEW" | "WAXING_CRESCENT" | "FIRST_QUARTER" | "WAXING_GIBBOUS" | "FULL" | "WANING_GIBBOUS" | "THIRD_QUARTER" | "WANING_CRESCENT"}
     */
    static MoonPhase(time) {
        const synodicMonth = 29.530588853;
        const referenceNewMoon = 947_182_440; // 2000-01-06T18:14Z
        const elapsedDays = (time - referenceNewMoon) / 86400;
        const phase = (((elapsedDays % synodicMonth) + synodicMonth) % synodicMonth) / synodicMonth;
        switch (true) {
            case phase < 1 / 16 || phase >= 15 / 16:
                return "NEW";
            case phase < 3 / 16:
                return "WAXING_CRESCENT";
            case phase < 5 / 16:
                return "FIRST_QUARTER";
            case phase < 7 / 16:
                return "WAXING_GIBBOUS";
            case phase < 9 / 16:
                return "FULL";
            case phase < 11 / 16:
                return "WANING_GIBBOUS";
            case phase < 13 / 16:
                return "THIRD_QUARTER";
            default:
                return "WANING_CRESCENT";
        }
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
     * 以最近的鄉鎮市區中心解析位置，帶出縣市與對應資料集。
     * Resolve the location through the nearest township centroid.
     * @returns {{county: string, township: string, geocode: string, distance: number, day3: string, day7: string} | undefined}
     */
    #ResolveLocation() {
        Console.info("☑️ CWA.#ResolveLocation");
        if (!Number.isFinite(this.latitude) || !Number.isFinite(this.longitude)) {
            Console.warn("CWA.#ResolveLocation", "Invalid coordinates");
            return;
        }
        let nearest;
        for (const [geocode, name, countyIndex, latitude, longitude] of TOWNSHIPS) {
            const distance = CWA.Distance(this.latitude, this.longitude, latitude, longitude);
            if (!nearest || distance < nearest.distance) nearest = { geocode, name, countyIndex, distance };
        }
        const [, countyGeocode, day3, day7] = COUNTIES[nearest.countyIndex];
        const countyName = COUNTIES[nearest.countyIndex][0];
        if (nearest.distance > CWA.MaximumLocationDistance) {
            Console.warn("CWA.#ResolveLocation", `Unsupported location; nearest township ${countyName}${nearest.name} is ${nearest.distance.toFixed(1)} km away`);
            return;
        }
        Console.info("✅ CWA.#ResolveLocation", `${countyName}${nearest.name}`, `${nearest.distance.toFixed(1)} km`);
        return { county: countyName, countyGeocode, township: nearest.name, geocode: nearest.geocode, distance: nearest.distance, day3, day7 };
    }

    #NearestStation() {
        let nearest;
        for (const [id, latitude, longitude] of STATIONS) {
            const distance = CWA.Distance(this.latitude, this.longitude, latitude, longitude);
            if (!nearest || distance < nearest.distance) nearest = { id, distance };
        }
        return nearest && nearest.distance <= CWA.MaximumStationDistance ? nearest : undefined;
    }

    /**
     * 鄉鎮預報釋出時間：每日 05:30、11:30、17:30、23:30。
     * Township forecast issue schedule: 05:30, 11:30, 17:30 and 23:30 local time.
     * @param {number} [now] 目前 Unix 秒 / Current Unix seconds.
     * @returns {number} 最近一次釋出的 Unix 秒 / Unix seconds of the latest issue.
     */
    static LatestIssueTime(now = Math.trunc(Date.now() / 1000)) {
        const local = now + 8 * 3600;
        const dayStart = local - (local % 86400);
        const seconds = local % 86400;
        const issues = [5.5 * 3600, 11.5 * 3600, 17.5 * 3600, 23.5 * 3600];
        let issued = dayStart - 86400 + issues.at(-1);
        for (const issue of issues) if (seconds >= issue) issued = dayStart + issue;
        return issued - 8 * 3600;
    }

    /**
     * 呼叫資料擷取 API。
     * Call the data retrieval API.
     * @param {string} dataset 資料集編號 / Dataset identifier.
     * @param {Record<string, string>} [parameters] 查詢參數 / Query parameters.
     * @returns {Promise<object>}
     */
    async #Get(dataset, parameters = {}) {
        if (!this.token) {
            Console.warn("CWA.#Get", "Missing authorization key");
            return {};
        }
        const url = new URL(`${CWA.Endpoint}/${dataset}`);
        url.searchParams.set("Authorization", this.token);
        url.searchParams.set("format", "JSON");
        for (const [key, value] of Object.entries(parameters)) {
            if (value === undefined || value === null || value === "") continue;
            url.searchParams.set(key, String(value));
        }
        Console.info("☑️ CWA.#Get", dataset);
        try {
            const response = await fetch({ url: url.toString(), headers: { Accept: "application/json" }, timeout: 20 });
            const body = JSON.parse(response?.body ?? "{}");
            if (response?.ok === false || String(body?.success ?? "").toLowerCase() !== "true") {
                Console.error("CWA.#Get", `upstreamStatus: ${response?.statusCode ?? response?.status}`, JSON.stringify(body).slice(0, 300));
                return {};
            }
            Console.info("✅ CWA.#Get", dataset);
            return body;
        } catch (error) {
            Console.error(`CWA.#Get: ${error}`);
            return {};
        }
    }

    /**
     * 一次取得未來 3 天與未來 1 週的鄉鎮預報，並依資料集分組。
     * Fetch the 3-day and 1-week township forecasts once and group them by dataset.
     * @returns {Promise<Record<string, Record<string, Array<{start: number, end: number, value: any}>>>>}
     */
    async #Forecast() {
        if (!this.#forecast) {
            this.#forecast = (async () => {
                Console.info("☑️ CWA.#Forecast");
                if (!this.available) return {};
                const body = await this.#Get("F-D0047-093", {
                    locationId: `${this.location.day3},${this.location.day7}`,
                    LocationName: this.location.township,
                    ElementName: [...new Set([...Object.values(CWA.#HourlyElements), ...Object.values(CWA.#DailyElements)])].join(","),
                });
                const groups = {};
                for (const group of body?.records?.Locations ?? []) {
                    const dataid = String(group?.Dataid ?? "");
                    if (!dataid) continue;
                    // Dataid 是 `D0047-061`；對照表用的是資料集編號 `F-D0047-061`。
                    // Dataid is `D0047-061`; the lookup table stores the dataset id `F-D0047-061`.
                    const dataset = `F-${dataid}`;
                    const location = group?.Location?.find(item => item?.LocationName === this.location.township) ?? group?.Location?.[0];
                    if (!location) continue;
                    const elements = {};
                    for (const element of location?.WeatherElement ?? []) {
                        if (element?.ElementName) elements[element.ElementName] = CWA.Timeline(element.Time);
                    }
                    groups[dataset] = elements;
                }
                Console.info("✅ CWA.#Forecast", Object.keys(groups).join(",") || "none");
                return groups;
            })();
        }
        return this.#forecast;
    }

    /**
     * 將資料集時間序列轉成依時間排序、帶有效區間的紀錄。
     * Convert a dataset time series into time-sorted records with validity ranges.
     * @param {Array<object>} [times] 資料集 Time 陣列 / Dataset Time array.
     * @returns {Array<{start: number, end: number, value: object}>}
     */
    static Timeline(times) {
        const timeline = [];
        for (const time of times ?? []) {
            const start = CWA.ToUnixSeconds(time?.StartTime ?? time?.DataTime);
            if (start === undefined) continue;
            const end = CWA.ToUnixSeconds(time?.EndTime) ?? start;
            timeline.push({ start, end: Math.max(end, start), value: time?.ElementValue?.[0] ?? {} });
        }
        timeline.sort((a, b) => a.start - b.start);
        return timeline;
    }

    /**
     * 取得涵蓋指定時間的紀錄；沒有涵蓋範圍時退回最近一筆。
     * Find the record covering the given time, falling back to the latest earlier record.
     * @param {Array<{start: number, end: number, value: object}>} [timeline] 時間序列 / Time series.
     * @param {number} time 目標 Unix 秒 / Target Unix seconds.
     * @returns {{start: number, end: number, value: object} | undefined}
     */
    static Pick(timeline, time) {
        let latest;
        for (const entry of timeline ?? []) {
            if (entry.start > time) break;
            if (entry.start <= time && time < entry.end) return entry;
            latest = entry;
        }
        return latest;
    }

    /**
     * 取得指定時間的數值。
     * Read a numeric value at the given time.
     * @param {Array<{start: number, end: number, value: object}>} [timeline] 時間序列 / Time series.
     * @param {number} time 目標 Unix 秒 / Target Unix seconds.
     * @param {string} key ElementValue 欄位名稱 / ElementValue key.
     * @returns {number | undefined}
     */
    static NumberAt(timeline, time, key) {
        return CWA.ToNumber(CWA.Pick(timeline, time)?.value?.[key]);
    }

    /**
     * 取得指定時間的文字。
     * Read a text value at the given time.
     * @param {Array<{start: number, end: number, value: object}>} [timeline] 時間序列 / Time series.
     * @param {number} time 目標 Unix 秒 / Target Unix seconds.
     * @param {string} key ElementValue 欄位名稱 / ElementValue key.
     * @returns {string | undefined}
     */
    static TextAt(timeline, time, key) {
        const value = String(CWA.Pick(timeline, time)?.value?.[key] ?? "").trim();
        return value || undefined;
    }

    #Metadata({ attributionUrl, reportedTime, expireTime, sourceType = "MODELED", temporarilyUnavailable = false } = {}) {
        const timeStamp = Math.trunc(Date.now() / 1000);
        return {
            attributionUrl,
            expireTime: expireTime ?? timeStamp + 60 * 60,
            language: "zh-TW",
            latitude: this.latitude,
            longitude: this.longitude,
            providerLogo: providerNameToLogo(this.providerName),
            providerName: this.providerName,
            readTime: timeStamp,
            reportedTime: reportedTime ?? timeStamp,
            temporarilyUnavailable,
            sourceType,
        };
    }

    /**
     * 現在天氣，來源為最近的氣象觀測站。
     * Current weather from the nearest observing station.
     * @returns {Promise<object | undefined>} WeatherKit currentWeather 片段 / currentWeather fragment.
     */
    async CurrentWeather() {
        Console.info("☑️ CWA.CurrentWeather");
        if (!this.available) {
            Console.info("✅ CWA.CurrentWeather", "Unavailable");
            return;
        }
        const station = this.#NearestStation();
        if (!station) {
            Console.info("✅ CWA.CurrentWeather", "No nearby station");
            return;
        }
        if (this.#station?.stationId !== station.id) {
            const body = await this.#Get("O-A0003-001", {
                StationId: station.id,
                WeatherElement: "Weather,VisibilityDescription,Now,WindDirection,WindSpeed,AirTemperature,RelativeHumidity,AirPressure,UVIndex,GustInfo",
                GeoInfo: "Coordinates,CountyName,TownName",
            });
            const record = body?.records?.Station?.[0];
            this.#station = record ? { stationId: station.id, distance: station.distance, record } : undefined;
        }
        const observed = this.#station;
        if (!observed) {
            Console.info("✅ CWA.CurrentWeather", "No observation");
            return;
        }
        const elements = observed.record.WeatherElement ?? {};
        const temperature = CWA.ToNumber(elements.AirTemperature);
        const humidity = CWA.ToNumber(elements.RelativeHumidity);
        const dewPoint = CWA.DewPoint(temperature, humidity);
        const pressure = CWA.ToNumber(elements.AirPressure);
        const windSpeed = CWA.ToNumber(elements.WindSpeed);
        const windGust = CWA.ToNumber(elements?.GustInfo?.PeakGustSpeed);
        const windDirection = CWA.ToNumber(elements.WindDirection);
        const uvIndex = CWA.ToNumber(elements.UVIndex);
        const visibility = CWA.Visibility(elements.VisibilityDescription);
        const reportedTime = CWA.ToUnixSeconds(observed.record?.ObsTime?.DateTime);
        Console.info("✅ CWA.CurrentWeather", `${observed.record.StationName}(${observed.stationId})`, `${observed.distance.toFixed(1)} km`);
        return {
            metadata: this.#Metadata({
                attributionUrl: `https://www.cwa.gov.tw/V8/C/W/OBS_Station.html?ID=${observed.stationId}`,
                expireTime: (reportedTime ?? Math.trunc(Date.now() / 1000)) + CWA.CurrentWeatherExpirationInterval,
                reportedTime,
                sourceType: "STATION",
            }),
            ...CWA.ConvertConditionField(elements.Weather),
            ...(temperature === undefined ? {} : { temperature }),
            ...(humidity === undefined ? {} : { humidity: Math.round(humidity) }),
            ...(dewPoint === undefined ? {} : { temperatureDewPoint: dewPoint }),
            ...(pressure === undefined ? {} : { pressure }),
            // WeatherKit 風速單位為 km/h，氣象署為 m/s。
            // WeatherKit expresses wind speed in km/h; CWA reports m/s.
            ...(windSpeed === undefined ? {} : { windSpeed: Math.round(windSpeed * 3.6 * 10) / 10 }),
            ...(windGust === undefined ? {} : { windGust: Math.round(windGust * 3.6 * 10) / 10 }),
            ...(windDirection === undefined || windDirection >= 990 ? {} : { windDirection }),
            ...(uvIndex === undefined ? {} : { uvIndex }),
            ...(visibility === undefined ? {} : { visibility }),
        };
    }

    /**
     * 能見度描述轉公尺，例如 `>30`、`21-30`、`11-20`。
     * Convert the visibility bucket into meters.
     * @param {unknown} description 能見度描述 / Visibility description.
     * @returns {number | undefined}
     */
    static Visibility(description) {
        const text = String(description ?? "").trim();
        if (!text || /^[Xx-]/.test(text)) return;
        const range = text.match(/^(\d+)\s*-\s*(\d+)$/);
        if (range) return Number(range[1]) * 1000;
        const greater = text.match(/^>\s*(\d+)$/);
        if (greater) return Number(greater[1]) * 1000;
        const less = text.match(/^<\s*(\d+)$/);
        if (less) return Number(less[1]) * 1000;
        const numeric = CWA.ToNumber(text);
        return numeric === undefined ? undefined : numeric * 1000;
    }

    /**
     * 逐時預報：優先使用未來 3 天資料，之後以未來 1 週逐 12 小時資料延伸。
     * Hourly forecast: prefer the 3-day dataset, then extend with the 1-week dataset.
     * @returns {Promise<object | undefined>} WeatherKit forecastHourly 片段 / forecastHourly fragment.
     */
    async Hourly() {
        Console.info("☑️ CWA.Hourly");
        if (!this.available) {
            Console.info("✅ CWA.Hourly", "Unavailable");
            return;
        }
        const forecast = await this.#Forecast();
        const day3 = forecast?.[this.location.day3];
        const day7 = forecast?.[this.location.day7];
        if (!day3 && !day7) {
            Console.info("✅ CWA.Hourly", "No forecast");
            return;
        }

        const now = Math.trunc(Date.now() / 1000);
        const hourly = CWA.#HourlyElements;
        const weekly = CWA.#DailyElements;
        const firstStart = day3?.[hourly.temperature]?.[0]?.start ?? day7?.[weekly.averageTemperature]?.[0]?.start;
        if (firstStart === undefined) {
            Console.info("✅ CWA.Hourly", "No usable series");
            return;
        }
        const first = Math.trunc(firstStart / 3600) * 3600;
        const threeDayStart = day3?.[hourly.weather]?.[0]?.start;
        const threeDayEnd = threeDayStart === undefined ? first : (day3[hourly.weather].at(-1)?.end ?? first);
        const weekEnd = day7?.[weekly.averageTemperature]?.at(-1)?.end ?? threeDayEnd;
        const last = Math.min(Math.max(threeDayEnd, weekEnd), first + 7 * 86400);

        const hours = [];
        for (let time = first; time <= last; time += 3600) {
            if (time + 3600 <= now) continue;
            const useWeekly = time >= threeDayEnd || !day3;
            const temperature = useWeekly ? CWA.NumberAt(day7?.[weekly.averageTemperature], time, "Temperature") : CWA.NumberAt(day3?.[hourly.temperature], time, "Temperature");
            if (temperature === undefined) continue;
            const weather = useWeekly ? CWA.TextAt(day7?.[weekly.weather], time, "Weather") : CWA.TextAt(day3?.[hourly.weather], time, "Weather");
            const humidity = useWeekly ? CWA.NumberAt(day7?.[weekly.humidity], time, "RelativeHumidity") : CWA.NumberAt(day3?.[hourly.humidity], time, "RelativeHumidity");
            const windSpeed = useWeekly ? CWA.NumberAt(day7?.[weekly.windSpeed], time, "WindSpeed") : CWA.NumberAt(day3?.[hourly.windSpeed], time, "WindSpeed");
            const windDirection = CWA.ConvertWindDirection(useWeekly ? CWA.TextAt(day7?.[weekly.windDirection], time, "WindDirection") : CWA.TextAt(day3?.[hourly.windDirection], time, "WindDirection"));
            const precipitationChance = useWeekly ? CWA.NumberAt(day7?.[weekly.precipitationChance], time, "ProbabilityOfPrecipitation") : CWA.NumberAt(day3?.[hourly.precipitationChance], time, "ProbabilityOfPrecipitation");
            const dewPoint = useWeekly ? CWA.DewPoint(temperature, humidity) : CWA.NumberAt(day3?.[hourly.dewPoint], time, "DewPoint");
            const apparentTemperature = useWeekly ? undefined : CWA.NumberAt(day3?.[hourly.apparentTemperature], time, "ApparentTemperature");
            hours.push({
                forecastStart: time,
                temperature,
                ...CWA.ConvertConditionField(weather),
                ...(dewPoint === undefined ? {} : { temperatureDewPoint: dewPoint }),
                ...(apparentTemperature === undefined ? {} : { temperatureApparent: apparentTemperature }),
                ...(humidity === undefined ? {} : { humidity: Math.round(humidity) }),
                // WeatherKit 風速單位為 km/h，氣象署為 m/s。
                ...(windSpeed === undefined ? {} : { windSpeed: Math.round(windSpeed * 3.6 * 10) / 10 }),
                ...(windDirection === undefined ? {} : { windDirection }),
                ...(precipitationChance === undefined ? {} : { precipitationChance: Math.round(precipitationChance) }),
            });
        }
        if (!hours.length) {
            Console.info("✅ CWA.Hourly", "No usable hours");
            return;
        }
        Console.info("✅ CWA.Hourly", `hours: ${hours.length}`);
        return {
            metadata: this.#Metadata({ attributionUrl: "https://www.cwa.gov.tw/V8/C/W/Town/Town.html", reportedTime: CWA.LatestIssueTime() }),
            hours,
        };
    }

    /**
     * 每日預報：以未來 1 週逐 12 小時資料組成日夜預報，並補上日出日沒與月相。
     * Daily forecast built from the 1-week 12-hour dataset, with sunrise/sunset and moon phase.
     * @returns {Promise<object | undefined>} WeatherKit forecastDaily 片段 / forecastDaily fragment.
     */
    async Daily() {
        Console.info("☑️ CWA.Daily");
        if (!this.available) {
            Console.info("✅ CWA.Daily", "Unavailable");
            return;
        }
        const forecast = await this.#Forecast();
        const weekly = CWA.#DailyElements;
        const hourly = CWA.#HourlyElements;
        const day7 = forecast?.[this.location.day7];
        if (!day7?.[weekly.weather]?.length) {
            Console.info("✅ CWA.Daily", "No forecast");
            return;
        }
        const day3 = forecast?.[this.location.day3];
        const sunMoon = await this.#SunMoon();

        // 以地方時分日，並依區塊開始時間判斷白天（06:00–18:00）或夜間。
        // Group blocks by local day and classify them as daytime (06:00–18:00) or overnight.
        const days = new Map();
        for (const block of day7[weekly.weather]) {
            const localStart = block.start + 8 * 3600;
            const dayStart = localStart - (localStart % 86400) - 8 * 3600;
            const hour = (localStart % 86400) / 3600;
            const entry = days.get(dayStart) ?? { dayStart, dayPart: undefined, nightPart: undefined };
            if (hour >= 6 && hour < 18) entry.dayPart ??= block;
            else entry.nightPart ??= block;
            days.set(dayStart, entry);
        }

        const result = [];
        for (const { dayStart, dayPart, nightPart } of [...days.values()].sort((a, b) => a.dayStart - b.dayStart)) {
            const parts = [dayPart, nightPart].filter(Boolean);
            // 12 小時區塊只有天氣現象與降雨機率，溫度與濕度必須取自各自的時間序列。
            // 12-hour blocks only carry weather and precipitation chance; read temperature and humidity from their own series.
            const blockValues = (series, key) => parts.map(block => CWA.ToNumber(CWA.Pick(series, block.start)?.value?.[key])).filter(value => value !== undefined);
            const temperaturesMax = blockValues(day7[weekly.maxTemperature], "MaxTemperature");
            const temperaturesMin = blockValues(day7[weekly.minTemperature], "MinTemperature");
            const hourlyHumidity = (day3?.[hourly.humidity] ?? []).filter(({ start }) => start >= dayStart && start < dayStart + 86400).map(({ value }) => CWA.ToNumber(value?.RelativeHumidity));
            const humidities = (hourlyHumidity.some(value => value !== undefined) ? hourlyHumidity : blockValues(day7[weekly.humidity], "RelativeHumidity")).filter(value => value !== undefined);
            const hourlyWindSpeeds = (day3?.[hourly.windSpeed] ?? [])
                .filter(({ start }) => start >= dayStart && start < dayStart + 86400)
                .map(({ value }) => CWA.ToNumber(value?.WindSpeed))
                .filter(value => value !== undefined);
            const speeds = (hourlyWindSpeeds.length ? hourlyWindSpeeds : blockValues(day7[weekly.windSpeed], "WindSpeed")).filter(value => value !== undefined);
            const precipitationChance = blockValues(day7[weekly.precipitationChance], "ProbabilityOfPrecipitation");
            const uvIndex = CWA.ToNumber(CWA.Pick(day7[weekly.uvIndex], dayStart + 12 * 3600)?.value?.UVIndex);
            const hourlyTemperatures = (day3?.[hourly.temperature] ?? []).filter(({ start }) => start >= dayStart && start < dayStart + 86400);
            const temperatureMaxTime = CWA.#ExtremeTime(hourlyTemperatures, "Temperature", "max");
            const temperatureMinTime = CWA.#ExtremeTime(hourlyTemperatures, "Temperature", "min");
            const day = {
                forecastStart: dayStart,
                forecastEnd: dayStart + 86400,
                ...(temperaturesMax.length ? { temperatureMax: Math.max(...temperaturesMax), temperatureMaxTime: temperatureMaxTime ?? dayStart + 15 * 3600 } : {}),
                ...(temperaturesMin.length ? { temperatureMin: Math.min(...temperaturesMin), temperatureMinTime: temperatureMinTime ?? dayStart + 5 * 3600 } : {}),
                ...(humidities.length ? { humidityMax: Math.round(Math.max(...humidities)), humidityMin: Math.round(Math.min(...humidities)) } : {}),
                ...(speeds.length
                    ? {
                          windSpeedAvg: Math.round((speeds.reduce((sum, value) => sum + value, 0) / speeds.length) * 3.6 * 10) / 10,
                          windSpeedMax: Math.round(Math.max(...speeds) * 3.6 * 10) / 10,
                      }
                    : {}),
                ...CWA.ConvertConditionField(dayPart?.value?.Weather ?? nightPart?.value?.Weather),
                ...(precipitationChance.length ? { precipitationChance: Math.round(Math.max(...precipitationChance)) } : {}),
                ...(uvIndex === undefined ? {} : { maxUvIndex: Math.round(uvIndex) }),
                moonPhase: CWA.MoonPhase(dayStart + 12 * 3600),
            };
            const sun = sunMoon.sunrise?.[dayStart];
            if (sun) {
                if (sun.sunrise !== undefined) day.sunrise = sun.sunrise;
                if (sun.sunset !== undefined) day.sunset = sun.sunset;
                if (sun.civilTwilightStart !== undefined) day.sunriseCivil = sun.civilTwilightStart;
                if (sun.civilTwilightEnd !== undefined) day.sunsetCivil = sun.civilTwilightEnd;
                if (sun.transit !== undefined) day.solarNoon = sun.transit;
            }
            const moon = sunMoon.moon?.[dayStart];
            if (moon) {
                if (moon.moonrise !== undefined) day.moonrise = moon.moonrise;
                if (moon.moonset !== undefined) day.moonset = moon.moonset;
                if (moon.transit !== undefined) day.solarMidnight = moon.transit;
            }
            if (dayPart) day.daytimeForecast = this.#DayPart(dayPart, day7, weekly, true);
            if (nightPart) day.overnightForecast = this.#DayPart(nightPart, day7, weekly, false);
            result.push(day);
        }
        if (!result.length) {
            Console.info("✅ CWA.Daily", "No usable days");
            return;
        }
        Console.info("✅ CWA.Daily", `days: ${result.length}`);
        return {
            metadata: this.#Metadata({ attributionUrl: "https://www.cwa.gov.tw/V8/C/W/Town/Town.html", reportedTime: CWA.LatestIssueTime() }),
            days: result,
        };
    }

    /**
     * 找出序列中最大值或最小值發生的時間。
     * Find when the series reaches its maximum or minimum.
     * @param {Array<{start: number, value: object}>} [timeline] 時間序列 / Time series.
     * @param {string} key ElementValue 欄位名稱 / ElementValue key.
     * @param {"max" | "min"} mode 取極值方式 / Which extreme to find.
     * @returns {number | undefined}
     */
    static #ExtremeTime(timeline, key, mode) {
        let extreme;
        for (const entry of timeline ?? []) {
            const value = CWA.ToNumber(entry.value?.[key]);
            if (value === undefined) continue;
            if (!extreme || (mode === "max" ? value > extreme.value : value < extreme.value)) extreme = { start: entry.start, value };
        }
        return extreme?.start;
    }

    /**
     * 組出日夜預報區塊。元件值可能分散在不同 ElementName，需逐項取值。
     * Build a day-part block; the values live in separate elements, so read each one individually.
     * @param {{start: number, end: number, value: object}} block 區塊 / Block.
     * @param {Record<string, Array<object>>} elements 1 週資料元素 / 1-week elements.
     * @param {Record<string, string>} weekly 元素名稱對照 / Element name mapping.
     * @param {boolean} daylight 是否為白天 / Whether the block is daytime.
     */
    #DayPart(block, elements, weekly, daylight) {
        const valueAt = (series, key) => CWA.ToNumber(CWA.Pick(series, block.start)?.value?.[key]);
        const temperatureMax = valueAt(elements[weekly.maxTemperature], "MaxTemperature");
        const temperatureMin = valueAt(elements[weekly.minTemperature], "MinTemperature");
        const temperatureApparentMax = valueAt(elements[weekly.maxApparentTemperature], "MaxApparentTemperature");
        const temperatureApparentMin = valueAt(elements[weekly.minApparentTemperature], "MinApparentTemperature");
        const humidity = valueAt(elements[weekly.humidity], "RelativeHumidity");
        const windSpeed = valueAt(elements[weekly.windSpeed], "WindSpeed");
        const windDirection = CWA.ConvertWindDirection(CWA.Pick(elements[weekly.windDirection], block.start)?.value?.WindDirection);
        const precipitationChance = valueAt(elements[weekly.precipitationChance], "ProbabilityOfPrecipitation");
        const uvIndexMax = valueAt(elements[weekly.uvIndex], "UVIndex");
        return {
            forecastStart: block.start,
            forecastEnd: block.end,
            daylight,
            ...CWA.ConvertConditionField(block.value?.Weather),
            ...(humidity === undefined ? {} : { humidity: Math.round(humidity) }),
            ...(windDirection === undefined ? {} : { windDirection }),
            ...(windSpeed === undefined ? {} : { windSpeed: Math.round(windSpeed * 3.6 * 10) / 10 }),
            ...(precipitationChance === undefined ? {} : { precipitationChance: Math.round(precipitationChance) }),
            ...(temperatureMax === undefined ? {} : { temperatureMax }),
            ...(temperatureMin === undefined ? {} : { temperatureMin }),
            ...(temperatureApparentMax === undefined ? {} : { temperatureApparentMax }),
            ...(temperatureApparentMin === undefined ? {} : { temperatureApparentMin }),
            ...(daylight && uvIndexMax !== undefined ? { uvIndexMax: Math.round(uvIndexMax) } : {}),
        };
    }

    /**
     * 縣市層級的日出日沒與月出月沒時刻。
     * County-level sunrise/ sunset and moonrise/ moonset times.
     * @returns {Promise<{sunrise: Record<number, object>, moon: Record<number, object>}>}
     */
    async #SunMoon() {
        if (!this.#sunMoon) {
            this.#sunMoon = (async () => {
                Console.info("☑️ CWA.#SunMoon");
                if (!this.available) return { sunrise: {}, moon: {} };
                const today = new Date((Math.trunc(Date.now() / 1000) + 8 * 3600) * 1000).toISOString().slice(0, 10);
                const [sunriseBody, moonBody] = await Promise.all([
                    this.#Get("A-B0062-001", { CountyName: this.location.county, timeFrom: today }),
                    this.#Get("A-B0063-001", { CountyName: this.location.county, timeFrom: today }),
                ]);
                const sunrise = {};
                for (const item of sunriseBody?.records?.locations?.location?.[0]?.time ?? []) {
                    const dayStart = CWA.ToUnixSeconds(item?.Date);
                    if (dayStart === undefined) continue;
                    sunrise[dayStart] = {
                        civilTwilightStart: CWA.ToUnixSeconds(`${item.Date}T${item.BeginCivilTwilightTime}:00+08:00`),
                        sunrise: CWA.ToUnixSeconds(`${item.Date}T${item.SunRiseTime}:00+08:00`),
                        transit: CWA.ToUnixSeconds(`${item.Date}T${item.SunTransitTime}:00+08:00`),
                        sunset: CWA.ToUnixSeconds(`${item.Date}T${item.SunSetTime}:00+08:00`),
                        civilTwilightEnd: CWA.ToUnixSeconds(`${item.Date}T${item.EndCivilTwilightTime}:00+08:00`),
                    };
                }
                const moon = {};
                for (const item of moonBody?.records?.locations?.location?.[0]?.time ?? []) {
                    const dayStart = CWA.ToUnixSeconds(item?.Date);
                    if (dayStart === undefined) continue;
                    moon[dayStart] = {
                        moonrise: CWA.ToUnixSeconds(`${item.Date}T${item.MoonRiseTime}:00+08:00`),
                        transit: CWA.ToUnixSeconds(`${item.Date}T${item.MoonTransitTime}:00+08:00`),
                        moonset: CWA.ToUnixSeconds(`${item.Date}T${item.MoonSetTime}:00+08:00`),
                    };
                }
                Console.info("✅ CWA.#SunMoon", `sunrise: ${Object.keys(sunrise).length}`, `moon: ${Object.keys(moon).length}`);
                return { sunrise, moon };
            })();
        }
        return this.#sunMoon;
    }

    /**
     * 天氣警特報，回傳 WeatherAlerts.Build 可消費的來源結構。
     * Weather warnings in the structure consumed by WeatherAlerts.Build.
     * @returns {Promise<object>} WeatherKit 頂級預警物件 / Top-level alert object.
     */
    async WeatherAlert() {
        Console.info("☑️ CWA.WeatherAlert");
        const failed = {
            metadata: {
                attributionUrl: "https://www.cwa.gov.tw/V8/C/P/Warning.html",
                providerLogo: providerNameToLogo(this.providerName),
                providerName: this.providerName,
                temporarilyUnavailable: true,
            },
            detailsUrl: this.AlertDetailsURL(),
            alerts: [],
            areaName: this.location?.county ?? "",
            source: this.providerName,
        };
        if (!this.available) {
            Console.info("✅ CWA.WeatherAlert", "Unavailable");
            return failed;
        }
        try {
            const county = this.location.county;
            const countyBody = await this.#Get("W-C0033-001", { locationName: county });
            const hazards = countyBody?.records?.location?.[0]?.hazardConditions?.hazards ?? [];
            const phenomena = [...new Set(hazards.map(hazard => String(hazard?.info?.phenomena ?? "")).filter(Boolean))];
            Console.info("CWA.WeatherAlert", `phenomena: ${phenomena.join(",") || "none"}`);
            if (!phenomena.length) {
                Console.info("✅ CWA.WeatherAlert", "No active warning");
                return { ...failed, metadata: { ...failed.metadata, temporarilyUnavailable: false } };
            }
            const datasets = new Set();
            for (const phenomenon of phenomena) {
                const matched = CWA.#WarningDatasets.find(({ pattern }) => pattern.test(phenomenon));
                if (!matched) {
                    Console.warn("CWA.WeatherAlert", `Unmapped phenomenon: ${phenomenon}`);
                    continue;
                }
                datasets.add(matched.dataset);
            }
            const bulletins = await Promise.all([...datasets].map(dataset => this.#Warning(dataset)));
            const alerts = bulletins.flatMap(({ dataset, body }) => this.#CreateAlerts(dataset, body, county, hazards)).filter(Boolean);
            alerts.sort((a, b) => (CWA.ToUnixSeconds(b.issuedTime) ?? 0) - (CWA.ToUnixSeconds(a.issuedTime) ?? 0));
            Console.info("✅ CWA.WeatherAlert", `alerts: ${alerts.length}`);
            return {
                metadata: { ...failed.metadata, temporarilyUnavailable: false },
                detailsUrl: this.AlertDetailsURL(),
                alerts,
                areaName: county,
                source: alerts[0]?.source ?? this.providerName,
            };
        } catch (error) {
            Console.error(`CWA.WeatherAlert: ${error}`);
            Console.info("✅ CWA.WeatherAlert");
            return failed;
        }
    }

    /**
     * Apple 官方預警詳情頁連結，`party` 用於頁面歸因文案。
     * Apple alertDetails page URL; `party` selects the attribution copy.
     * @returns {string}
     */
    AlertDetailsURL() {
        const ids = `${this.latitude},${this.longitude}`;
        return `https://weatherkit.apple.com/alertDetails/index.html?ids=${encodeURIComponent(ids)}&lang=${encodeURIComponent(this.weatherKitLanguage)}&party=CWA`;
    }

    async #Warning(dataset) {
        if (!this.#warnings.has(dataset)) this.#warnings.set(dataset, this.#Get(dataset));
        return { dataset, body: await this.#warnings.get(dataset) };
    }

    /**
     * 評估特報區域對指定地點的涵蓋程度，數字越大越精確。
     * Score how precisely a warning area covers the requested location.
     * 特報區域可能是縣市（`臺北市`）、縣市加鄉鎮（`新竹縣關西鎮`）或別名（`恆春半島`）。
     * A warning area may be a county, a county plus township, or an alias.
     * @param {unknown} area 特報區域 / Warning area.
     * @param {string} county 目標縣市 / Target county.
     * @param {string} [township] 目標鄉鎮 / Target township.
     * @returns {number} 3 = 縣市＋鄉鎮、2 = 縣市、1 = 同縣市其他鄉鎮、0 = 未涵蓋 / 3 = county+township, 2 = county, 1 = other township in the county, 0 = no coverage.
     */
    static AreaCoverageScore(area, county, township) {
        const name = String(area ?? "").trim();
        if (!name || !county) return 0;
        if (CWA.#WarningAreaAliases.get(name) === county) return 2;
        if (name === county) return 2;
        if (township && name === `${county}${township}`) return 3;
        return name.startsWith(county) ? 1 : 0;
    }

    #CreateAlerts(dataset, body, county, hazards) {
        const alerts = [];
        const township = this.location?.township;
        const infos = body?.records?.info ?? [];
        for (const info of infos) {
            const areas = (info?.area ?? []).map(area => area?.areaDesc).filter(Boolean);
            // 氣象署特報以「縣市」或「縣市＋鄉鎮」發布；只要縣市相符即視為涵蓋，
            // 精確命中鄉鎮者優先，其次才是只提到其他鄉鎮的同縣市特報。
            // CWA warnings are issued for a county or a county plus township; a county match covers
            // the location, with an exact township match ranked above a same-county township.
            const score = areas.length
                ? Math.max(...areas.map(area => CWA.AreaCoverageScore(area, county, township)))
                : hazards.some(hazard => hazard?.info?.phenomena && String(info?.event ?? "").includes(String(hazard.info.phenomena)))
                  ? 2
                  : 0;
            if (!score) continue;
            const title = info?.parameter?.find(parameter => parameter?.valueName === "alert_title")?.value ?? info?.headline;
            const isTyphoon = dataset === "W-C0034-001";
            const alert = this.#CreateAlert(dataset, info, county, {
                description: info?.headline ?? title,
                eventName: title,
                guidelines: this.#SplitGuidelines(info?.instruction),
                message: isTyphoon ? this.#TyphoonDescription(info) : info?.description,
                token: info?.eventCode?.value,
            });
            if (alert) alerts.push({ ...alert, __score: score });
        }
        return CWA.#StrongestAlerts(alerts);
    }

    /**
     * 同一事件可能同時有不同燈號與不同涵蓋範圍的多筆特報；先取涵蓋範圍最精確的一筆，
     * 範圍相同時再取最嚴重的一筆。
     * The same event may be published at several colour levels and coverage areas; keep the
     * most precise area first, then the most severe alert.
     * @param {Array<object>} alerts 原始預警 / Raw alerts.
     * @returns {Array<object>}
     */
    static #StrongestAlerts(alerts) {
        const severityRank = { extreme: 4, severe: 3, moderate: 2, minor: 1, unknown: 0 };
        const strongest = new Map();
        for (const alert of alerts) {
            const key = alert.eventName || alert.description;
            const current = strongest.get(key);
            const score = alert.__score ?? 0;
            const currentScore = current?.__score ?? 0;
            const better = !current || score > currentScore || (score === currentScore && (severityRank[alert.severity] ?? 0) > (severityRank[current.severity] ?? 0));
            if (better) strongest.set(key, alert);
        }
        return [...strongest.values()].map(({ __score, ...alert }) => alert);
    }

    #CreateAlert(dataset, info, county, { description, eventName, guidelines, message, token }) {
        const countyGeocode = COUNTIES.find(([name]) => name === county)?.[1];
        const issuedTime = CWA.ToUnixSeconds(info?.effective) ?? CWA.ToUnixSeconds(info?.onset);
        if (issuedTime === undefined) return undefined;
        const onsetTime = CWA.ToUnixSeconds(info?.onset) ?? issuedTime;
        const expireTime = CWA.ToUnixSeconds(info?.expires);
        const title = String(description ?? eventName ?? "").trim();
        if (!title) return undefined;
        return {
            ...(countyGeocode ? { areaId: countyGeocode } : {}),
            areaName: county,
            certainty: String(info?.certainty ?? "unknown").toLowerCase(),
            description: title,
            ...(expireTime === undefined ? {} : { expireTime: new Date(expireTime * 1000).toISOString(), eventEndTime: new Date(expireTime * 1000).toISOString() }),
            identifier: `${dataset}:${county}:${token ?? title}:${onsetTime}`,
            issuedTime: new Date(issuedTime * 1000).toISOString(),
            effectiveTime: new Date(onsetTime * 1000).toISOString(),
            eventOnsetTime: new Date(onsetTime * 1000).toISOString(),
            ...(eventName ? { eventName: String(eventName).trim() } : {}),
            guidelines,
            message: String(message ?? description ?? "").trim(),
            phenomenon: String(info?.category ?? "Met"),
            reportedAt: new Date(issuedTime * 1000).toISOString(),
            responses: info?.responseType ? [String(info.responseType)] : [],
            severity: String(info?.severity ?? "unknown").toLowerCase(),
            source: String(info?.senderName ?? this.providerName).trim() || this.providerName,
            standard: "",
            ...(token ? { token: String(token) } : {}),
            urgency: String(info?.urgency ?? "unknown").toLowerCase(),
        };
    }

    /**
     * 颱風警報的 description 是分節結構，需攤平成文字。
     * Flatten the sectioned typhoon CAP description into text.
     * @param {any} info CAP info 物件 / CAP info object.
     * @returns {string}
     */
    #TyphoonDescription(info) {
        const description = info?.description;
        if (typeof description === "string") return description;
        const sections = description?.section ?? description?.["typhoon-info"]?.[0]?.section ?? [];
        if (!Array.isArray(sections)) return "";
        return sections
            .map(section => (section?.title && section?.value ? `${section.title}：${section.value}` : section?.value ?? ""))
            .filter(Boolean)
            .join("\n");
    }

    #SplitGuidelines(instruction) {
        return String(instruction ?? "")
            .split(/\r?\n/)
            .map(line => line.trim())
            .filter(Boolean);
    }
}
