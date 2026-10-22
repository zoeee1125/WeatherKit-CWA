import { Console } from "@nsnanocat/util";

/**
 * 提供空氣品質標準（AQI Scale）的本地回應能力。
 * Provides local responses for air-quality scales.
 *
 * 天氣 App 在顯示空氣品質前，會先請求 `/api/v1/airQualityScale/{language}/{scale}`
 * 取得等級名稱、顏色與數值範圍；沒有這份定義就不會渲染空氣品質卡片。
 * Before rendering air quality, the Weather app requests
 * `/api/v1/airQualityScale/{language}/{scale}` for level names, colors and ranges.
 *
 * 目前提供臺灣環境部 AQI（`TW.AQI`）。
 * Currently provides Taiwan MOENV AQI (`TW.AQI`).
 */
export default class AirQualityScale {
    static Name = "AirQualityScale";
    static Version = "1.0.0";
    static Author = "iRingo";

    /** 標準識別碼 / Scale identifier. */
    static ScaleName = "TW.AQI";

    /**
     * 修訂版號。
     * Revision number.
     *
     * 只要更動這份定義的任何顯示內容（名稱、顏色、等級、建議），就必須遞增這個數字。
     * 天氣 App 會把回應中的 `version` 接在標準識別碼後面再次請求，因此改版號等於換一個
     * 新的 URL，可以繞過 App 與系統 HTTP 快取裡舊的回應。
     * Bump this whenever anything user-visible changes (names, colors, levels, advice).
     * The Weather app re-requests the scale with the response's `version` appended, so a new
     * revision means a new URL, which bypasses the app's and the HTTP cache's stale copy.
     */
    static Revision = 3;

    /**
     * 注入到氣象資料中的標準識別碼（含修訂版號）。
     * Scale identifier handed to the Weather app, including the revision.
     *
     * `Request.mjs` 會以 {@link StripVersion} 去掉尾碼後再查表，所以這裡帶版號是安全的。
     * `Request.mjs` strips the suffix with {@link StripVersion} before looking the scale up,
     * so carrying the revision here is safe.
     */
    static get RequestName() {
        return `${AirQualityScale.ScaleName}.${AirQualityScale.Revision}`;
    }

    /**
     * 支援的標準名稱（不含版本後綴）。
     * Supported scale identifiers without the trailing version.
     */
    static ScaleNames = [AirQualityScale.ScaleName];

    #Config = {
        Headers: {
            "Content-Type": "application/json",
            // 這份定義由本地產生，不需要向 Apple 取得，因此沒有必要快取；設成一年只會讓
            // 每次改版都要手動清快取。no-store 讓修改在下一次請求就生效。
            // The definition is generated locally rather than fetched from Apple, so caching buys
            // nothing and a one-year TTL only forces manual cache clearing after every edit.
            // `no-store` makes changes take effect on the next request.
            "Cache-Control": "no-store, max-age=0",
        },
        Language: {
            en: "en-US",
            "en-us": "en-US",
            zh: "zh-Hant-TW",
            "zh-tw": "zh-Hant-TW",
            "zh-hant": "zh-Hant-TW",
            "zh-hant-tw": "zh-Hant-TW",
        },
        AirQualityScale: {
            "TW.AQI": {
                "zh-Hant-TW": {
                    name: AirQualityScale.ScaleName,
                    displayName: "AQI",
                    shortDisplayName: "AQI",
                    longDisplayName: "空氣品質指標",
                    displayLabel: "空氣品質",
                    language: "zh-Hant-TW",
                    version: AirQualityScale.Revision,
                    aqi: {
                        numerical: true,
                        ascending: true,
                        range: [0, 500],
                        categories: [
                            { categoryNumber: 1, range: [0, 50], color: "#00FF00", categoryName: "良好", glyph: "", recommendation: "空氣品質良好，適合正常戶外活動。" },
                            { categoryNumber: 2, range: [51, 100], color: "#FFFF00", categoryName: "普通", glyph: "", recommendation: "空氣品質尚可，敏感族群應留意身體狀況。" },
                            { categoryNumber: 3, range: [101, 150], color: "#FF7E00", categoryName: "對敏感族群不健康", glyph: "", recommendation: "敏感族群應減少戶外劇烈運動。" },
                            { categoryNumber: 4, range: [151, 200], color: "#FF0000", categoryName: "不健康", glyph: "", recommendation: "所有族群應減少戶外活動，敏感族群應避免。" },
                            { categoryNumber: 5, range: [201, 300], color: "#800080", categoryName: "非常不健康", glyph: "", recommendation: "所有族群應避免戶外活動。" },
                            { categoryNumber: 6, range: [301, 500], color: "#7E0023", categoryName: "危害", glyph: "", recommendation: "應留在室內並關閉門窗。" },
                        ],
                        // location 用的是量表數值本身，不是 0～1 的比例：天氣 App 會拿 AQI 直接
                        // 在漸變上取色，寫成比例的話所有色標會擠在量表開頭，整條漸變塌成一個顏色。
                        // `location` is a value on the scale, not a 0–1 fraction: the app samples the
                        // gradient with the raw AQI, so fractions collapse every stop into the start.
                        gradient: {
                            stops: [
                                { location: 0, color: "#00FF00" },
                                { location: 50, color: "#00FF00" },
                                { location: 100, color: "#FFFF00" },
                                { location: 150, color: "#FF7E00" },
                                { location: 200, color: "#FF0000" },
                                { location: 300, color: "#800080" },
                                { location: 500, color: "#7E0023" },
                            ],
                        },
                    },
                },
                "en-US": {
                    name: AirQualityScale.ScaleName,
                    displayName: "AQI",
                    shortDisplayName: "AQI",
                    longDisplayName: "Air Quality Index",
                    displayLabel: "Air Quality",
                    language: "en-US",
                    version: AirQualityScale.Revision,
                    aqi: {
                        numerical: true,
                        ascending: true,
                        range: [0, 500],
                        categories: [
                            { categoryNumber: 1, range: [0, 50], color: "#00FF00", categoryName: "Good", glyph: "", recommendation: "Air quality is good. Enjoy normal outdoor activities." },
                            { categoryNumber: 2, range: [51, 100], color: "#FFFF00", categoryName: "Moderate", glyph: "", recommendation: "Air quality is acceptable. Sensitive groups should watch for symptoms." },
                            { categoryNumber: 3, range: [101, 150], color: "#FF7E00", categoryName: "Unhealthy for Sensitive Groups", glyph: "", recommendation: "Sensitive groups should reduce strenuous outdoor activity." },
                            { categoryNumber: 4, range: [151, 200], color: "#FF0000", categoryName: "Unhealthy", glyph: "", recommendation: "Everyone should reduce outdoor activity; sensitive groups should avoid it." },
                            { categoryNumber: 5, range: [201, 300], color: "#800080", categoryName: "Very Unhealthy", glyph: "", recommendation: "Everyone should avoid outdoor activity." },
                            { categoryNumber: 6, range: [301, 500], color: "#7E0023", categoryName: "Hazardous", glyph: "", recommendation: "Stay indoors and keep windows closed." },
                        ],
                        // location 用的是量表數值本身，不是 0～1 的比例：天氣 App 會拿 AQI 直接
                        // 在漸變上取色，寫成比例的話所有色標會擠在量表開頭，整條漸變塌成一個顏色。
                        // `location` is a value on the scale, not a 0–1 fraction: the app samples the
                        // gradient with the raw AQI, so fractions collapse every stop into the start.
                        gradient: {
                            stops: [
                                { location: 0, color: "#00FF00" },
                                { location: 50, color: "#00FF00" },
                                { location: 100, color: "#FFFF00" },
                                { location: 150, color: "#FF7E00" },
                                { location: 200, color: "#FF0000" },
                                { location: 300, color: "#800080" },
                                { location: 500, color: "#7E0023" },
                            ],
                        },
                    },
                },
            },
        },
    };

    /**
     * 建立指定語言與標準的本地回應。
     * Build a local response for the given language and scale.
     * @param {string} language 語言 / Language.
     * @param {string} scaleName 標準名稱 / Scale identifier.
     * @returns {{status: number, headers: Record<string, string>, body: string} | undefined}
     */
    Build(language, scaleName) {
        const configLanguage = this.#GetConfigLanguage(language);
        const scale = this.#Config.AirQualityScale[scaleName]?.[configLanguage];
        if (!scale) {
            Console.warn("AirQualityScale.Build", `unsupported scale: ${scaleName}`, `language: ${language}`);
            return undefined;
        }
        Console.info("✅ AirQualityScale.Build", scaleName, configLanguage);
        return {
            status: 200,
            headers: { ...this.#Config.Headers },
            body: JSON.stringify(scale),
        };
    }

    /**
     * 移除標準名稱末尾的數字版本。
     * Strip the trailing numeric version from a scale identifier.
     * @param {string} [scaleName] 標準名稱 / Scale identifier.
     * @returns {string | undefined}
     */
    static StripVersion(scaleName) {
        return scaleName?.replace(/\.\d+$/, "");
    }

    /**
     * 按 BCP 47 對照表查找設定語言鍵。
     * Resolve the configuration language key through the BCP 47 map.
     * @param {string} [language] 語言 / Language.
     * @returns {string | undefined}
     */
    #GetConfigLanguage(language) {
        return this.#Config.Language[language?.toLowerCase()];
    }
}
