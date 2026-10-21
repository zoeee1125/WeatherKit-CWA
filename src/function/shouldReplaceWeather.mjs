import { Console } from "@nsnanocat/util";

/**
 * 判斷是否要替換指定地區的天氣資料。
 * Decide whether weather data for the given region should be replaced.
 *
 * 中央氣象署只提供臺灣資料，因此當該資料源已解析出臺灣座標時直接替換。
 * CWA only serves Taiwan, so a resolved Taiwan coordinate replaces directly.
 *
 * @param {import("../types").Settings} Settings 設定 / Settings.
 * @param {any} enviroments 環境 / Environments.
 * @returns {boolean}
 */
export default function shouldReplaceWeather(Settings, enviroments) {
    const country = enviroments?.country;
    const covers = Settings?.Weather?.Provider === "CWA" && Boolean(enviroments?.cwa?.available);
    Console.info("shouldReplaceWeather", `country: ${country}`, `provider: ${Settings?.Weather?.Provider}`, `cwa: ${covers}`);
    return covers;
}
