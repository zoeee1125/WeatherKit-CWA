import { Console } from "@nsnanocat/util";

/**
 * 判斷是否要替換指定國家/地區的天氣資料。
 * Decide whether weather data for the given country/region should be replaced.
 *
 * 規則 / Rules:
 * 1. `Weather.Replace` 涵蓋目前國家/地區時替換。
 * 2. 中央氣象署只在臺灣可用，因此當該資料源已解析出臺灣座標時直接替換，
 *    讓使用者不必額外把 `TW` 加進替換範圍。
 *    CWA only serves Taiwan, so a resolved Taiwan coordinate replaces directly and
 *    users do not have to add `TW` to the replacement range.
 *
 * @param {import("../types").Settings} Settings 設置 / Settings.
 * @param {any} enviroments 環境 / Environments.
 * @returns {boolean}
 */
export default function shouldReplaceWeather(Settings, enviroments) {
    const country = enviroments?.country;
    const replace = Settings?.Weather?.Replace;
    const listed = Array.isArray(replace) ? replace.includes(country) : String(replace ?? "").includes(String(country ?? ""));
    if (listed) return true;
    const covers = Settings?.Weather?.Provider === "CWA" && Boolean(enviroments?.cwa?.available);
    Console.info("shouldReplaceWeather", `country: ${country}`, `provider: ${Settings?.Weather?.Provider}`, `listed: ${listed}`, `cwa: ${covers}`);
    return covers;
}
