#  iRingo: 🌤 WeatherKit

把 iOS / iPadOS / macOS 內建「天氣」的資料來源切換到臺灣中央氣象署（CWA）。

## 資料源

本專案只支援一個協力廠商資料源：

- **中央氣象署（臺灣，CWA）** — 目前天氣、逐時預報、每日預報與天氣警特報

需要「不替換」時，可在設定中選擇 `WeatherKit`，模組會完全保留 Apple 原始資料。

## 快速開始

1. 在 <https://opendata.cwa.gov.tw/> 取得授權碼
2. 在 Surge → 模組 → 新增，貼上訂閱網址：

   ```text
   https://github.com/zoeee1125/WeatherKit-CWA/releases/latest/download/iRingo.WeatherKit.sgmodule
   ```

3. 在 BoxJs 的 `iRingo.WeatherKit` 填入 `[API] 中央氣象署授權碼`

訂閱一次即可，之後發布新版本時 Surge 會自動更新。完整說明、資料集對應與已知限制見 [docs/cwa-provider.md](docs/cwa-provider.md)。

## 降雨通知

「未來一小時降水強度」通知由天氣 App 自己發出：模組把中央氣象署的雨量換成 Apple 的逐分鐘結構，系統便有起雨時間可以排定通知，不需要代理程式常駐排程。前提是該城市在關注列表中並已開啟通知；`[降雨通知] 通知方式` 可切換原生優先（預設）、只用原生或只用排程。詳見 [docs/cwa-provider.md](docs/cwa-provider.md)。

## 天氣警特報

Apple 對臺灣不回 `weatherAlerts` 資料槽，模組會自行組出完整集合補上，內容取自中央氣象署的警特報（`W-C0033-*`、`W-C0034-001`）。只有真的有生效中的警報時才會出現，沒有警報時與 Apple 原樣一致。

## 授權

Apache-2.0，見 [LICENSE](LICENSE)。
