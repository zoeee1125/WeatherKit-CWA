import { Console } from "@nsnanocat/util";
import * as flatbuffers from "flatbuffers";
import AirQuality from "../class/AirQuality.mjs";
import CWA from "../class/CWA.mjs";
import ForecastNextHour from "../class/ForecastNextHour.mjs";
import Weather from "../class/Weather.mjs";
import WeatherAlerts from "../class/WeatherAlerts.mjs";
import WeatherKit2 from "../class/WeatherKit2.mjs";
import database from "../function/database.mjs";
import mergeWeatherKitAvailability from "../function/mergeWeatherKitAvailability.mjs";
import parseWeatherKitURL from "../function/parseWeatherKitURL.mjs";
import providerNameToLogo from "../function/providerNameToLogo.mjs";
import setENV from "../function/setENV.mjs";
import shouldReplaceWeather from "../function/shouldReplaceWeather.mjs";
/***************** 處理流程 *****************/
export async function Response($request, $response) {
    // 解析網址
    const url = new URL($request.url);
    Console.info(`url: ${url.toJSON()}`);
    // 取得連線參數
    const PATHs = url.pathname.split("/").filter(Boolean);
    Console.info(`PATHs: ${PATHs}`);
    // 解析格式
    const FORMAT = ($response.headers?.["Content-Type"] ?? $response.headers?.["content-type"])?.split(";")?.[0];
    Console.info(`FORMAT: ${FORMAT}`);
    /**
     * 設定
     * @type {{Settings: import('../types').Settings}}
     */
    const { Settings, Caches, Configs } = setENV("iRingo", "WeatherKit", database);
    Console.logLevel = Settings.LogLevel;
    // 建立空資料
    let body = {};
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
            break;
        case "text/xml":
        case "text/html":
        case "text/plist":
        case "application/xml":
        case "application/plist":
        case "application/x-plist":
            break;
        case "text/vtt":
        case "application/vtt":
            break;
        case "text/json":
        case "application/json":
            body = JSON.parse($response.body);
            switch (url.hostname) {
                case "weatherkit.apple.com":
                    // 路徑判斷
                    switch (url.pathname) {
                        default:
                            if (url.pathname.startsWith("/api/v1/availability/")) {
                                body = mergeWeatherKitAvailability(body, Configs?.Availability?.v2);
                            }
                            break;
                    }
                    break;
            }
            $response.body = JSON.stringify(body);
            break;
        case "application/vnd.apple.flatbuffer":
        case "application/protobuf":
        case "application/x-protobuf":
        case "application/vnd.google.protobuf":
        case "application/grpc":
        case "application/grpc+proto":
        case "application/octet-stream": {
            let rawBody = $response.bodyBytes ? new Uint8Array($response.bodyBytes) : ($response.body ?? new Uint8Array());
            switch (FORMAT) {
                case "application/vnd.apple.flatbuffer": {
                    // 解析 FlatBuffer
                    const ByteBuffer = new flatbuffers.ByteBuffer(rawBody);
                    // 主機判斷
                    switch (url.hostname) {
                        case "weatherkit.apple.com":
                            // 路徑判斷
                            if (url.pathname.startsWith("/api/v2/weather/")) {
                                const parameters = parseWeatherKitURL(url);
                                const dataSets = parameters.dataSets.filter(dataSet => Settings.DataSets.includes(dataSet));
                                const rootNames = dataSets.map(dataSet => Configs.DataSets[dataSet] ?? dataSet);
                                body = WeatherKit2.decode(ByteBuffer, rootNames);
                                const providerParameters = { ...parameters, weatherKitLanguage: body.weatherAlerts?.metadata?.language };
                                const enviroments = {
                                    airQuality: new AirQuality(providerParameters, Settings?.API?.Environment?.Token, { useFixture: Settings?.AirQuality?.UseFixture === true }),
                                    cwa: new CWA(providerParameters, Settings?.API?.CWA?.Token),
                                    forecastNextHour: new ForecastNextHour(providerParameters, Settings?.API?.CWA?.Token),
                                    country: parameters.country,
                                };

                                await Promise.all(
                                    dataSets.map(async dataSet => {
                                        switch (dataSet) {
                                            case "airQuality": {
                                                const injectedAirQuality = await InjectAirQuality(body.airQuality, Settings, enviroments);
                                                if (injectedAirQuality !== undefined) body.airQuality = injectedAirQuality;
                                                break;
                                            }
                                            case "currentWeather": {
                                                const injectedCurrentWeather = await InjectCurrentWeather(body.currentWeather, Settings, enviroments);
                                                if (injectedCurrentWeather !== undefined) body.currentWeather = injectedCurrentWeather;
                                                break;
                                            }
                                            case "forecastDaily": {
                                                const injectedForecastDaily = await InjectForecastDaily(body.forecastDaily, Settings, enviroments);
                                                if (injectedForecastDaily !== undefined) body.forecastDaily = injectedForecastDaily;
                                                break;
                                            }
                                            case "forecastHourly": {
                                                const injectedForecastHourly = await InjectForecastHourly(body.forecastHourly, Settings, enviroments);
                                                if (injectedForecastHourly !== undefined) body.forecastHourly = injectedForecastHourly;
                                                break;
                                            }
                                            case "forecastNextHour": {
                                                const injectedForecastNextHour = await InjectForecastNextHour(body.forecastNextHour, Settings, enviroments);
                                                if (injectedForecastNextHour !== undefined) body.forecastNextHour = injectedForecastNextHour;
                                                break;
                                            }
                                            case "weatherAlerts": {
                                                const injectedAlerts = await InjectWeatherAlerts(body.weatherAlerts, Settings, enviroments);
                                                // 沒有原始 slot 時不要建立 key，否則編碼器會收到非物件而失敗。
                                                // Do not create the key when the slot is absent; the encoder rejects non-objects.
                                                if (injectedAlerts !== undefined) body.weatherAlerts = injectedAlerts;
                                                break;
                                            }
                                            default:
                                                // 其餘資料槽一律保留 Apple 原值。
                                                // Every other slot keeps Apple's value.
                                                break;
                                        }
                                    }),
                                );
                                rawBody = WeatherKit2.encode(ByteBuffer, body);
                                break;
                            }
                            break;
                    }
                    break;
                }
                case "application/protobuf":
                case "application/x-protobuf":
                case "application/vnd.google.protobuf":
                    break;
                case "application/grpc":
                case "application/grpc+proto":
                    break;
                case "application/octet-stream":
                    break;
            }
            // 寫入二進位資料
            $response.body = rawBody;
            break;
        }
    }
    return $response;
}

/**
 * 注入目前天氣資料
 * @param {any} currentWeather - 目前天氣資料物件
 * @param {import('../types').Settings} Settings - 設定物件
 * @param {any} enviroments - 環境變數
 * @returns {Promise<any>} 注入後的目前天氣資料
 */
async function InjectCurrentWeather(currentWeather, Settings, enviroments) {
    Console.info("☑️ InjectCurrentWeather");
    // Apple 對部分地區不會回傳 currentWeather 區塊，此時沒有可合併的目標。
    // Apple omits the currentWeather slot for some regions; there is nothing to merge into.
    if (!currentWeather) {
        Console.warn("InjectCurrentWeather", "No Apple currentWeather slot");
        Console.info("✅ InjectCurrentWeather");
        return currentWeather;
    }
    if (!shouldReplaceWeather(Settings, enviroments)) {
        Console.warn("InjectCurrentWeather", `未替換的地區：${enviroments.country}`);
        Console.info("✅ InjectCurrentWeather");
        return currentWeather;
    }
    let newCurrentWeather;
    switch (Settings?.Weather?.Provider) {
        case "WeatherKit":
        default:
            break;
        case "CWA": {
            newCurrentWeather = await enviroments.cwa.CurrentWeather();
            break;
        }
    }
    if (newCurrentWeather?.metadata) {
        newCurrentWeather.metadata = { ...currentWeather?.metadata, ...newCurrentWeather.metadata };
        currentWeather = { ...currentWeather, ...newCurrentWeather };
        currentWeather.metadata.providerLogo = providerNameToLogo(currentWeather.metadata.providerName);
    }
    Console.info("✅ InjectCurrentWeather");
    return currentWeather;
}

/**
 * 注入每日天氣預報資料
 * @param {any} forecastDaily - 每日預報資料物件
 * @param {import('../types').Settings} Settings - 設定物件
 * @param {any} enviroments - 環境變數
 * @returns {Promise<any>} 注入後的每日預報資料
 */
async function InjectForecastDaily(forecastDaily, Settings, enviroments) {
    Console.info("☑️ InjectForecastDaily");
    if (!forecastDaily) {
        Console.warn("InjectForecastDaily", "No Apple forecastDaily slot");
        Console.info("✅ InjectForecastDaily");
        return forecastDaily;
    }
    if (!shouldReplaceWeather(Settings, enviroments)) {
        Console.warn("InjectForecastDaily", `未替換的地區：${enviroments.country}`);
        Console.info("✅ InjectForecastDaily");
        return forecastDaily;
    }
    let newForecastDaily;
    switch (Settings?.Weather?.Provider) {
        case "WeatherKit":
        default:
            break;
        case "CWA": {
            newForecastDaily = await enviroments.cwa.Daily();
            break;
        }
    }
    if (newForecastDaily?.metadata) {
        forecastDaily.metadata = { ...forecastDaily?.metadata, ...newForecastDaily.metadata };
        forecastDaily.days = Weather.mergeForecast(forecastDaily?.days, newForecastDaily?.days);
        forecastDaily.metadata.providerLogo = providerNameToLogo(forecastDaily.metadata.providerName);
    }
    Console.info("✅ InjectForecastDaily");
    return forecastDaily;
}

/**
 * 注入逐時天氣預報資料
 * @param {any} forecastHourly - 逐時預報資料物件
 * @param {import('../types').Settings} Settings - 設定物件
 * @param {any} enviroments - 環境變數
 * @returns {Promise<any>} 注入後的逐時預報資料
 */
async function InjectForecastHourly(forecastHourly, Settings, enviroments) {
    Console.info("☑️ InjectForecastHourly");
    if (!forecastHourly) {
        Console.warn("InjectForecastHourly", "No Apple forecastHourly slot");
        Console.info("✅ InjectForecastHourly");
        return forecastHourly;
    }
    if (!shouldReplaceWeather(Settings, enviroments)) {
        Console.warn("InjectForecastHourly", `未替換的地區：${enviroments.country}`);
        Console.info("✅ InjectForecastHourly");
        return forecastHourly;
    }
    let newForecastHourly;
    switch (Settings?.Weather?.Provider) {
        case "WeatherKit":
        default:
            break;
        case "CWA": {
            newForecastHourly = await enviroments.cwa.Hourly();
            break;
        }
    }
    if (newForecastHourly?.metadata) {
        forecastHourly.metadata = { ...forecastHourly?.metadata, ...newForecastHourly.metadata };
        forecastHourly.hours = Weather.mergeForecast(forecastHourly?.hours, newForecastHourly?.hours);
        forecastHourly.metadata.providerLogo = providerNameToLogo(forecastHourly.metadata.providerName);
    }
    Console.info("✅ InjectForecastHourly");
    return forecastHourly;
}

/**
 * 注入未來一小時降水預報資料
 * @param {any} forecastNextHour - 未來一小時預報資料物件
 * @param {import('../types').Settings} Settings - 設定物件
 * @param {any} enviroments - 環境變數
 * @returns {Promise<any>} 注入後的未來一小時預報資料
 */
async function InjectForecastNextHour(forecastNextHour, Settings, enviroments) {
    Console.info("☑️ InjectForecastNextHour");
    // Apple 對台灣不會回傳 forecastNextHour 區塊，此時直接建立新的資料槽。
    // 少數情況下會回一個沒有逐分鐘資料的空槽，同樣視為沒有資料，否則中央氣象署的預報
    // 永遠補不進去，天氣 App 也就沒有起雨時間可以排定通知。
    // Apple omits the forecastNextHour slot for Taiwan, so a new slot is created instead. It
    // occasionally returns an empty slot without minute data; treating that as absent keeps the
    // CWA forecast (and the onset the Weather app schedules notifications against) in place.
    const hasMinutes = Array.isArray(forecastNextHour?.minutes) && forecastNextHour.minutes.length > 0;
    if (hasMinutes) {
        Console.info("✅ InjectForecastNextHour");
        return forecastNextHour;
    }
    let newForecastNextHour;
    switch (Settings?.NextHour?.Provider) {
        case "WeatherKit":
            break;
        case "CWA":
        default: {
            newForecastNextHour = await enviroments.forecastNextHour.NextHour();
            break;
        }
    }
    if (newForecastNextHour?.metadata) {
        newForecastNextHour.metadata.providerLogo = providerNameToLogo(newForecastNextHour.metadata.providerName);
    }
    Console.info("✅ InjectForecastNextHour");
    return newForecastNextHour;
}

/**
 * 注入天氣警特報資料
 * @param {any} weatherAlerts - 警特報集合資料物件
 * @param {import('../types').Settings} Settings - 設定物件
 * @param {any} enviroments - 環境變數
 * @returns {Promise<any>} 注入後的警特報集合資料
 */
async function InjectWeatherAlerts(weatherAlerts, Settings, enviroments) {
    Console.info("☑️ InjectWeatherAlerts");
    // Apple 對部分地區不會回傳 weatherAlerts 區塊；此時沒有可合併的目標，必須直接跳過。
    // Apple omits the weatherAlerts slot for some regions; there is nothing to merge into, so skip.
    if (!weatherAlerts) {
        Console.warn("InjectWeatherAlerts", "No Apple weatherAlerts slot");
        Console.info("✅ InjectWeatherAlerts");
        return weatherAlerts;
    }
    let newWeatherAlerts;
    switch (Settings?.WeatherAlerts?.Provider) {
        case "WeatherKit":
            break;
        case "CWA": {
            newWeatherAlerts = await enviroments.cwa.WeatherAlert();
            break;
        }
    }
    if (newWeatherAlerts?.metadata) {
        weatherAlerts.metadata = { ...weatherAlerts?.metadata, ...newWeatherAlerts.metadata };
        weatherAlerts.detailsUrl = newWeatherAlerts.detailsUrl ?? weatherAlerts.detailsUrl;
        weatherAlerts.alerts = WeatherAlerts.mergeAlerts(weatherAlerts?.alerts, newWeatherAlerts?.alerts);
        weatherAlerts.metadata.providerLogo = providerNameToLogo(weatherAlerts.metadata.providerName);
    }
    Console.info("✅ InjectWeatherAlerts");
    return weatherAlerts;
}

/**
 * 注入空氣品質資料
 * @param {any} airQuality - WeatherKit 原始空氣品質物件
 * @param {import('../types').Settings} Settings - 設定物件
 * @param {any} enviroments - 環境變數
 * @returns {Promise<any>} 注入後的空氣品質物件
 */
async function InjectAirQuality(airQuality, Settings, enviroments) {
    Console.info("☑️ InjectAirQuality");
    switch (Settings?.AirQuality?.Provider) {
        case "WeatherKit":
        default:
            Console.info("✅ InjectAirQuality", "Kept Apple data");
            return airQuality;
        case "Environment": {
            const injected = await enviroments.airQuality.Current();
            if (!injected?.metadata || injected.metadata.temporarilyUnavailable) {
                Console.info("✅ InjectAirQuality", "No replacement");
                return airQuality;
            }
            Console.info("✅ InjectAirQuality", injected.metadata.providerName);
            return {
                ...airQuality,
                ...injected,
                metadata: { ...(airQuality?.metadata ?? {}), ...injected.metadata },
            };
        }
    }
}
