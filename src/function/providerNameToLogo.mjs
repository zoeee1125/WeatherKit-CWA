import { Console } from "@nsnanocat/util";

/**
 * 依資料源名稱回傳對應版本的標誌；Apple、WeatherKit、空值及未知來源不補標誌。
 * Return the versioned logo for a provider; Apple, WeatherKit, empty, and unknown providers do not receive a logo.
 *
 * 中央氣象署不提供標誌：天氣 App 只信任 Apple 自家 CDN 上的圖示，
 * 外部網址（GitHub raw、GitHub Pages）都會渲染成空白方塊。
 * 省略 `providerLogo` 後，App 會改為顯示 `providerName` 文字。
 * CWA intentionally has no logo: the Weather app only renders icons hosted on Apple's own CDN,
 * and external hosts (GitHub raw, GitHub Pages) all render as blank squares. Omitting
 * `providerLogo` makes the app fall back to the `providerName` text instead.
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
    // 目前沒有任何資料源使用自訂標誌。
    // No provider currently uses a custom logo.
    Console.info("✅ providerNameToLogo");
    return undefined;
}
