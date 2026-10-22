### 🆕 New Features
  * 全面改為中央氣象署（CWA）單一資料源：目前天氣、逐時預報、每日預報與天氣警特報都來自開放資料平台。使用前需填寫 `API.CWA.Token` 授權碼，設定方式見 [docs/cwa-provider.md](docs/cwa-provider.md)。
  * 新增環境部（MOENV）空氣品質資料源與臺灣 AQI（`TW.AQI`）標準定義。以最近測站配對，最多 80 公里；需填寫 `API.Environment.Token`。
  * 新增未來一小時降水預報：Apple 只對澳洲、愛爾蘭、日本、英國與美國提供這份資料，臺灣取不到。現在改用中央氣象署 QPESUMS 雷達定量降雨預報格點資料補上，取周圍 3×3 格點的最大值，讓天氣 App 顯示「接下來一小時」的降水卡片。可在 `[未來一小時降水] 資料源` 切換。

### 🛠️ Bug Fixes
  * 修復 Apple 未回傳 `weatherAlerts` 或 `currentWeather` 等資料槽時，注入流程對 `undefined` 賦值而中斷整個回應的問題。現在缺少資料槽會直接跳過該項。
  * 修復正式版範本遺漏 `api.v1.airQualityScale` 請求規則，本地產生的臺灣 AQI 定義從未送達天氣 App，空氣品質卡片因此無法渲染。
  * 修復模板中 `{{scriptParams}}` 被 Handlebars 做 HTML 轉義的問題。參數變成 `DataSets&#x3D;&quot;...&quot;` 後 Surge 的 `{{{變數}}}` 佔位符不會被替換，腳本完全拿不到模組參數，`LogLevel` 回退導致後續日誌消失、設定值也全部失效。
  * 空氣品質標準的回應改為不快取（`no-store`），並在注入的標準識別碼帶上修訂版號，改版後天氣 App 會用新的網址重新取得，不必手動清快取。

### 🔣 Dependencies
  * 將 WeatherKit FlatBuffers 繫結從私有 `@nsringo/weatherkit` 改為倉庫內的 `packages/weatherkit-schema`，所有相依都來自公開 npm，建置不再需要 GitHub Packages 權限或任何金鑰。
  * 將 FlatBuffer Root 處理器遷移至已發佈的 `@nsnanocat/flatbuffer-root@1.0.0`。

### ‼️ Breaking Changes
  * 移除彩雲天氣、和風天氣與 WAQI 資料源。未選擇的資料集一律保留 Apple 原始資料；空氣品質改由環境部提供，未來一小時降水改由中央氣象署提供。
  * 移除 `Weather.Replace` 設定。中央氣象署只提供臺灣資料，選定該資料源且座標可解析為臺灣鄉鎮時即直接替換。
  * 資料集預設值新增 `forecastNextHour`，並新增 `[未來一小時降水] 資料源` 設定項。

### 🔄 Other Changes
  * 設定介面、程式註解與專案文件全面改為繁體中文。
  * 補充中央氣象署資料源的天氣現象、風向、時間解析、月相、時間序列、警報覆蓋率與設定項迴歸測試。
  * 模組的 `script-path` 與工作流都指向本倉庫，Release 可自給自足。
  * 模組與 bundle 改用固定的 `releases/latest/download/` 連結，訂閱一次後不必再隨版本重新安裝。
  * Surge 與 Stash 的外置資源更新間隔由 24 小時改為 1 小時（`script-update-interval=3600`、`interval: 3600`），並利用 ETag 避免重複下載，新版本不必等一天才生效。
  * 空氣品質卡片標題改為只顯示 `AQI`，不再帶上 `(TW)` 之類的國家後綴。
  * 降雨通知的判定放寬：過去一小時只有微量飄雨（例如 0.25 毫米）時，不再被當成「已經在下雨」而略過接下來明顯變大的雨勢。現在分為「即將降雨」與「雨勢會變大」兩種通知，冷卻時間由 3 小時縮短為 90 分鐘。
