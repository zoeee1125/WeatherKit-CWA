import { Console } from "@nsnanocat/util";

/**
 * 依資料源名稱回傳對應版本的標誌；Apple、WeatherKit、空值及未知來源不補標誌。
 * Return the versioned logo for a provider; Apple, WeatherKit, empty, and unknown providers do not receive a logo.
 *
 * 標誌必須是「透明背景 + 單色前景」的模板圖：天氣 App 只取 alpha 通道，
 * 再依介面深淺自動上色。若圖示背景不透明，整個方塊都會被當成圖形而渲染成白塊。
 * The logo must be a transparent-background template image: the Weather app samples only the
 * alpha channel and tints it automatically. An opaque background would render as a solid square.
 *
 * @param {string | null | undefined} providerName - 資料源名稱。
 * Provider name.
 * @param {string} [version="v2"] - 標誌資源版本。
 * Logo asset version.
 * @returns {string | undefined} 符合的資料源標誌網址。
 * Matched provider logo URL.
 */
export default function providerNameToLogo(providerName, version = "v2") {
    Console.info("☑️ providerNameToLogo", `providerName: ${providerName}`, `version: ${version}`);
    const normalizedProviderName = providerName?.split("\n")?.[0]?.trim();
    if (!normalizedProviderName || ["apple", "apple weather", "weatherkit"].includes(normalizedProviderName.toLowerCase())) {
        Console.info("✅ providerNameToLogo");
        return;
    }
    let providerLogo;
    switch (normalizedProviderName) {
        case "CWA":
        case "中央氣象署":
            providerLogo = `https://zoeee1125.github.io/WeatherKit-CWA/assets/icon/${version}/CWA.png`;
            break;
        default:
            break;
    }
    Console.info("✅ providerNameToLogo");
    return providerLogo;
}
