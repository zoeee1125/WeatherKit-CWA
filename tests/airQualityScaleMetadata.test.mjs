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
    assert.equal(zh.version, AirQualityScale.Revision);

    const en = JSON.parse(new AirQualityScale().Build("en-US", "TW.AQI").body);

    assert.equal(en.displayName, "AQI", "英文卡片標題同樣只顯示 AQI");
    assert.equal(en.shortDisplayName, "AQI");
    assert.equal(en.longDisplayName, "Air Quality Index");
    assert.equal(en.displayLabel, "Air Quality");
});

test("空氣品質標準不快取，避免改版後仍顯示舊內容", () => {
    // 這份定義由本地產生，不快取沒有任何頻寬成本；不快取才能讓改版立刻生效。
    // The definition is generated locally, so caching costs nothing; not caching makes edits
    // take effect immediately.
    const built = new AirQualityScale().Build("zh-Hant-TW", "TW.AQI");
    assert.match(built.headers["Cache-Control"], /no-store/);
});

test("未知標準仍回傳 undefined，交由呼叫端透傳", () => {
    assert.equal(new AirQualityScale().Build("zh-Hant-TW", "HK.AQHI"), undefined);
    assert.equal(new AirQualityScale().Build("zh-Hant-TW", "TW.AQI").status, 200);
});

/**
 * 漸變色標的 `location` 是量表數值本身，不是 0～1 的比例。
 * Gradient stop `location` is a value on the scale, not a 0–1 fraction.
 *
 * 曾經寫成 0、0.2、…、1，而量表 range 是 0–500：所有色標全擠在量表開頭，
 * 天氣 App 拿 AQI 去取色時整條漸變塌成同一個顏色，看起來就是「沒有顏色區分」。
 * It used to be 0, 0.2, … 1 against a 0–500 range: every stop collapsed into the start of the
 * scale, so sampling the gradient with a real AQI always returned one colour.
 */
test("漸變色標使用量表數值，不是 0～1 的比例", () => {
    for (const language of ["zh-Hant-TW", "en-US"]) {
        const scale = JSON.parse(new AirQualityScale().Build(language, "TW.AQI").body);
        const [min, max] = scale.aqi.range;
        const locations = scale.aqi.gradient.stops.map(stop => stop.location);

        assert.equal(locations[0], min, "第一個色標落在量表最小值");
        assert.equal(locations.at(-1), max, "最後一個色標落在量表最大值");
        assert.ok(
            locations.every(location => location >= min && location <= max),
            "色標必須落在量表範圍內",
        );
        assert.deepEqual(
            [...locations].sort((a, b) => a - b),
            locations,
            "色標必須遞增",
        );
        assert.ok(locations.filter(location => location <= 1).length <= 2, "色標不能全部擠在量表開頭（比例寫法的症狀）");
        // 每個色標的顏色都要能在等級表裡找到，否則漸變與等級會互相矛盾。
        // Every stop colour must exist in the category list, otherwise the gradient contradicts the levels.
        const categoryColors = new Set(scale.aqi.categories.map(category => category.color));
        for (const stop of scale.aqi.gradient.stops) assert.ok(categoryColors.has(stop.color), stop.color);
    }
});

test("修訂版號變更會反映在注入的標準識別碼上", () => {
    // 天氣 App 會把回應的 version 接在識別碼後重取，改版號等於換網址、繞過快取。
    // The app re-requests with the response version appended, so a new revision bypasses caches.
    assert.ok(AirQualityScale.Revision >= 3, "漸變修正後必須遞增修訂版號");
    assert.equal(AirQualityScale.RequestName, `TW.AQI.${AirQualityScale.Revision}`);
});
