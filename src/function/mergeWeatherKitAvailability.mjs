export default function mergeWeatherKitAvailability(appleCapabilities, pluginCapabilities = []) {
    if (!Array.isArray(appleCapabilities)) return appleCapabilities;

    // 在 Apple 返回值上補齊外掛能力，避免系統新增 capability 被固定列表吞掉。
    return [...new Set([...appleCapabilities, ...pluginCapabilities])];
}
