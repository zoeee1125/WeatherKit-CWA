### 🆕 New Features
  * 全面改為中央氣象署（CWA）單一資料源：目前天氣、逐時預報、每日預報與天氣警特報都來自開放資料平台。使用前需填寫 `API.CWA.Token` 授權碼，設定方式見 [docs/cwa-provider.md](docs/cwa-provider.md)。
  * 新增環境部（MOENV）空氣品質資料源與臺灣 AQI（`TW.AQI`）標準定義。以最近測站配對，最多 80 公里；需填寫 `API.Environment.Token`。

### 🛠️ Bug Fixes
  * 修復 Apple 未回傳 `weatherAlerts` 或 `currentWeather` 等資料槽時，注入流程對 `undefined` 賦值而中斷整個回應的問題。現在缺少資料槽會直接跳過該項。

### 🔣 Dependencies
  * 將 WeatherKit FlatBuffers 繫結從私有 `@nsringo/weatherkit` 改為倉庫內的 `packages/weatherkit-schema`，所有相依都來自公開 npm，建置不再需要 GitHub Packages 權限或任何金鑰。
  * 將 FlatBuffer Root 處理器遷移至已發佈的 `@nsnanocat/flatbuffer-root@1.0.0`。

### ‼️ Breaking Changes
  * 移除彩雲天氣、和風天氣與 WAQI 資料源，以及未來一小時降水等相關設定。未選擇的資料集一律保留 Apple 原始資料。空氣品質改由環境部提供。
  * 移除 `Weather.Replace` 設定。中央氣象署只提供臺灣資料，選定該資料源且座標可解析為臺灣鄉鎮時即直接替換。

### 🔄 Other Changes
  * 設定介面、程式註解與專案文件全面改為繁體中文。
  * 補充中央氣象署資料源的天氣現象、風向、時間解析、月相、時間序列、警報覆蓋率與設定項迴歸測試。
  * 模組的 `script-path` 與工作流都指向本倉庫，Release 可自給自足。
  * 模組與 bundle 改用固定的 `releases/latest/download/` 連結，訂閱一次後不必再隨版本重新安裝。
