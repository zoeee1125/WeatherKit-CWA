import { Lodash as _, Console, Storage } from "@nsnanocat/util";
import AirQualityScale from "../class/AirQualityScale.mjs";
import CWA from "../class/CWA.mjs";
import WeatherAlerts from "../class/WeatherAlerts.mjs";
import database from "../function/database.mjs";
import parseWeatherKitURL from "../function/parseWeatherKitURL.mjs";
import setENV from "../function/setENV.mjs";
/***************** 處理流程 *****************/
export async function Request($request) {
    // 建構回覆資料
    let $response = undefined;
    // 解析網址
    const url = new URL($request.url);
    Console.info(`url: ${url.toJSON()}`);
    const parameters = parseWeatherKitURL(url);
    // 解析格式
    const FORMAT = ($request.headers?.["Content-Type"] ?? $request.headers?.["content-type"])?.split(";")?.[0];
    Console.info(`FORMAT: ${FORMAT}`);
    /**
     * 設定
     * @type {{Settings: import('./types').Settings}}
     */
    const { Settings, Caches } = setENV("iRingo", "WeatherKit", database);
    // 方法判斷
    switch ($request.method) {
        case "POST":
        case "PUT":
        case "PATCH":
        // biome-ignore lint/suspicious/noFallthroughSwitchClause: <explanation>
        case "DELETE":
            // 格式判斷
            switch (FORMAT) {
                case undefined: // 視為沒有 body
                    break;
                case "application/x-www-form-urlencoded":
                case "text/plain":
                default:
                    break;
                case "application/x-mpegURL":
                case "application/x-mpegurl":
                case "application/vnd.apple.mpegurl":
                case "audio/mpegurl":
                    //body = M3U8.parse($request.body);
                    break;
                case "application/json":
                case "text/json":
                    break;
                case "application/vnd.apple.flatbuffer":
                case "application/protobuf":
                case "application/x-protobuf":
                case "application/vnd.google.protobuf":
                case "application/grpc":
                case "application/grpc+proto":
                case "application/octet-stream": {
                    // 解析 FlatBuffer
                    const rawBody = $request.bodyBytes ? new Uint8Array($request.bodyBytes) : new Uint8Array($request.body ?? []);
                    // 寫入二進位資料
                    $request.body = rawBody;
                    break;
                }
            }
        //break; // 不中斷，繼續處理網址
        case "GET":
        case "HEAD":
        case "OPTIONS":
        default:
            delete $request?.headers?.["If-None-Match"];
            delete $request?.headers?.["if-none-match"];
            // 主機判斷
            switch (url.hostname) {
                case "weatherkit.apple.com":
                    // 路徑判斷
                    switch (url.pathname) {
                        case "/api/v1/weatherAlerts": {
                            $response = await GetWeatherAlerts(url.searchParams.get("ids")?.trim(), parameters, Settings, $request.headers);
                            break;
                        }
                        default:
                            switch (true) {
                                case url.pathname.startsWith("/api/v1/airQualityScale/"): {
                                    // 天氣 App 需要本地標準定義才會渲染空氣品質卡片。
                                    // The Weather app needs a local scale definition before rendering air quality.
                                    const scaleName = AirQualityScale.StripVersion(parameters.scale);
                                    const built = scaleName ? new AirQualityScale().Build(parameters.language, scaleName) : undefined;
                                    if (built) {
                                        $response = built;
                                    } else if (scaleName) {
                                        // 未知標準移除版本後綴，避免 Apple 回 404。
                                        // Strip the version suffix on unknown scales to avoid a 404 from Apple.
                                        url.pathname = `/api/${parameters.version}/airQualityScale/${parameters.language}/${scaleName}`;
                                    }
                                    break;
                                }
                                case url.pathname.startsWith("/api/v2/weather/"): {
                                    // 空氣品質資料槽由 country 參數決定；台灣不在 Apple 支援名單內，
                                    // 可改寫成其他支援地區以借用該地區的空氣品質路徑。
                                    // The air-quality slot follows the country parameter; Taiwan is not on
                                    // Apple's supported list, so it can be rewritten to a supported region.
                                    if (Settings?.AirQuality?.CountryOverride) {
                                        Console.info("☑️ AirQuality.CountryOverride", `${url.searchParams.get("country")} -> ${Settings.AirQuality.CountryOverride}`);
                                        url.searchParams.set("country", Settings.AirQuality.CountryOverride);
                                        Console.info("✅ AirQuality.CountryOverride", url.searchParams.get("country"));
                                    }
                                    // 解決 macOS 天氣 app 如果使用國際版 Maps 時，country 遺失而不顯示未來一小時降水的問題
                                    switch (true) {
                                        case $request.headers["User-Agent"]?.startsWith("WeatherKit_Weather_macOS_Version"):
                                        case $request.headers["user-agent"]?.startsWith("WeatherKit_Weather_macOS_Version"):
                                            if (url.searchParams.has("country")) {
                                            } else {
                                                const gcc = Storage.getItem("@iRingo.Location.Caches")?.pep?.gcc;
                                                if (gcc) url.searchParams.set("country", gcc);
                                            }
                                            break;
                                    }
                                    break;
                                }
                            }
                            break;
                    }
                    break;
            }
            break;
        case "CONNECT":
        case "TRACE":
            break;
    }
    $request.url = url.toString();
    Console.debug(`$request.url: ${$request.url}`);
    return { $request, $response };
}

/**
 * 取得天氣警特報回應
 * @param {string | undefined} identifier - 警特報識別碼
 * @param {ReturnType<typeof parseWeatherKitURL>} parameters - WeatherKit 請求參數
 * @param {import('../types').Settings} Settings - 設定物件
 * @param {Record<string, string>} headers - 請求標頭
 * @returns {Promise<object>} 天氣警特報回應
 */
async function GetWeatherAlerts(identifier, parameters, Settings, headers) {
    let body = [];
    try {
        // 只有座標形式的識別碼能對應到中央氣象署的鄉鎮範圍。
        // Only coordinate identifiers can be mapped to a CWA township.
        switch (true) {
            case /^-?[0-9]+(?:\.[0-9]+)?,-?[0-9]+(?:\.[0-9]+)?$/.test(identifier): {
                switch (Settings?.WeatherAlerts?.Provider) {
                    case "CWA": {
                        Console.info("☑️ CWA.WeatherAlert", `ids: ${identifier}`);
                        const cwa = new CWA(parameters, Settings?.API?.CWA?.Token);
                        const source = await cwa.WeatherAlert();
                        body = WeatherAlerts.Build(source, {
                            attributionUrl: source?.metadata?.attributionUrl ?? "https://www.cwa.gov.tw/V8/C/P/Warning.html",
                            identifier: `${parameters.latitude},${parameters.longitude}`,
                            language: parameters.language,
                            countryCode: "TW",
                        });
                        break;
                    }
                }
                break;
            }
        }
    } catch (error) {
        Console.error("WeatherAlerts", error?.stack ?? error?.message ?? String(error));
    }
    Console.info("✅ WeatherAlerts", `alerts: ${body.length}`, "status: 200");
    return {
        status: 200,
        statusCode: 200,
        headers: {
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "max-age=0",
            "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
    };
}
