# 中央氣象署（CWA）資料源

本模組會把 iOS / iPadOS / macOS 內建「天氣」的資料切換到臺灣中央氣象署（Central Weather Administration, CWA）開放資料平台。這是本專案唯一支援的協力廠商資料源。

## 前置條件

1. 在 <https://opendata.cwa.gov.tw/> 註冊會員，並在會員中心取得授權碼（形如 `CWA-XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX`）。
2. 使用 Surge 安裝 `iRingo.WeatherKit` 模組，啟用 HTTPS 解密（MITM），並信任 Surge 憑證。
3. 請求座標必須能解析到臺灣地區的鄉鎮市區；距離最近的鄉鎮市區中心超過 50 km 時不會替換。

## 設定

在 BoxJs 開啟 `iRingo.WeatherKit`，設定以下項目：

| 設定項 | 值 | 說明 |
| --- | --- | --- |
| `[API] 中央氣象署授權碼` | 你的 CWA 授權碼 | 必填；留空時 CWA 資料源不可用 |
| `[天氣] 資料源` | `中央氣象署（臺灣）` | 預設值；替換目前天氣、逐時與每日預報 |
| `[天氣警特報] 資料源` | `中央氣象署（臺灣）` | 預設值；需要 CWA 警特報時設定 |

模組參數的鍵名分別為 `API.CWA.Token`、`Weather.Provider`、`WeatherAlerts.Provider`，效果與在 BoxJs 設定相同。

## 資料集對應

| WeatherKit 資料集 | CWA 來源 | 說明 |
| --- | --- | --- |
| `currentWeather` | `O-A0003-001` | 最近觀測站，每 10 分鐘更新 |
| `forecastHourly` | `F-D0047-093`（3 天） | 逐時預報；3 天之後用 1 週資料以 12 小時為間隔延伸 |
| `forecastDaily` | `F-D0047-093`（1 週） | 7 天，含最高/最低溫、紫外線、日出日沒、月出月沒與月相 |
| `weatherAlerts` | `W-C0033-001`、`W-C0033-003`～`010`、`W-C0034-001` | 先取縣市警報現象，再依縣市/鄉鎮覆蓋率挑選最精確的一筆 |
| `airQuality` | 不提供 | 臺灣空氣品質屬環境部資料；保留 Apple 原資料 |
| `forecastNextHour` | 不提供 | CWA 沒有分鐘級降水資料集；保留 Apple 原資料 |

## 已知限制

- CWA 的警報是「警特報」，不是 Apple 的逐事件預警；同一事件會合併為一筆，並保留最嚴重或最精確的區域。
- 觀測站可能距離實際位置數十公里，目前天氣代表附近觀測站的觀測值，不是格點插值。
- 月相由本地朔望月週期推算，可能有約半天誤差。
- 風速會從 CWA 的 m/s 換算為 WeatherKit 的 km/h。
- 授權碼請勿提交到倉庫或公開分享；本倉庫的預設值為空字串。

## 訂閱與更新

模組與腳本都使用固定的 `releases/latest/download/` 連結，因此**訂閱一次即可**，之後發布新版本時 Surge 會自動更新，不需要重新安裝。

訂閱網址：

```text
https://github.com/zoeee1125/WeatherKit-CWA/releases/latest/download/iRingo.WeatherKit.sgmodule
```

在 Surge → 模組 → 新增 → 貼上網址，即會以訂閱形式安裝並自動檢查更新。若要手動更新，在模組頁下拉重新整理即可。

## 建置

本倉庫已把 Apple WeatherKit 的 FlatBuffers 綁定內嵌為本地套件 `packages/weatherkit-schema`，所有相依都來自公開 npm，因此不需要任何 GitHub Packages 憑證：

```bash
npm install
npm run build          # 產生 dist/request.bundle.js 與 dist/response.bundle.js
npm run build:args     # 產生 dist/iRingo.WeatherKit.sgmodule 等模組
```

推送 `vX.Y.Z` 標籤會觸發 GitHub Actions 建立 Release；`latest` 永遠指向最新的非預先發布版本，訂閱端因此會自動取得新內容。
