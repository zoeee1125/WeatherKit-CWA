import assert from "node:assert/strict";
import test from "node:test";
import AirQualityScale from "../src/class/AirQualityScale.mjs";

/**
 * 天氣 App 直接把 `displayName` 當成卡片標題顯示。
 * The Weather app renders `displayName` as the card title verbatim.
 *
 * 因此不能把地區代碼寫進 `displayName`，否則卡片會顯示「AQI (TW)」。
 * 地區資訊保留在 `name`（`TW.AQI`），顯示字串維持 Apple 原生的簡短形式。
 * The region must not be baked into `displayName`, otherwise the card reads "AQI (TW)".
 * Keep the region in `name` (`TW.AQI`) and the display strings short like Apple's.
 */
test("TW.AQI 的顯示名稱不帶國家後綴", () => {
    const zh = JSON.parse(new AirQualityScale().Build("zh-Hant-TW", "TW.AQI").body);

    assert.equal(zh.name, "TW.AQI", "標準識別碼仍保留地區");
    assert.equal(zh.displayName, "AQI", "卡片標題只顯示 AQI");
    assert.equal(zh.shortDisplayName, "AQI");
    assert.equal(zh.longDisplayName, "空氣品質指標");
    assert.equal(zh.displayLabel, "空氣品質");
    assert.equal(zh.version, 1);

    const en = JSON.parse(new AirQualityScale().Build("en-US", "TW.AQI").body);

    assert.equal(en.displayName, "AQI", "英文卡片標題同樣只顯示 AQI");
    assert.equal(en.shortDisplayName, "AQI");
    assert.equal(en.longDisplayName, "Air Quality Index");
    assert.equal(en.displayLabel, "Air Quality");
});

test("未知標準仍回傳 undefined，交由呼叫端透傳", () => {
    assert.equal(new AirQualityScale().Build("zh-Hant-TW", "HK.AQHI"), undefined);
    assert.equal(new AirQualityScale().Build("zh-Hant-TW", "TW.AQI").status, 200);
});
