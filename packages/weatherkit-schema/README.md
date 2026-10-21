# weatherkit-schema

Apple WeatherKit 的 FlatBuffers 綁定（table 類別與 enum）。

原本來自私有套件 `@nsringo/weatherkit`，此處改為 repo 內的本地套件，讓建置不再需要 GitHub Packages 權限。

## 來源與授權

- 來源：<https://github.com/NSRingo/WeatherKit> 的已發佈 `response.bundle.js`（v3.3.2）
- 授權：Apache-2.0
- 內容：27 個 FlatBuffers table 類別、23 個 enum，保留原始壓縮識別碼以確保欄位偏移與列舉值完全一致
- 匯出：`src/index.mjs` 末端以 `export { ... as Name }` 提供穩定名稱，呼叫端不需理會壓縮識別碼

## 使用

```js
import * as WK2 from "weatherkit-schema";

WK2.WeatherCondition.CLEAR; // 0
WK2.CurrentWeatherData.createCurrentWeatherData(builder, ...);
```

## 更新方式

若上游 schema 變更，重新從對應版本的 `response.bundle.js` 抽出 `const y=new Int32Array(2);` 到 `class <ForecastNextHour>` 之前的區塊，替換 `src/index.mjs` 內容並更新 export 對照表即可。
